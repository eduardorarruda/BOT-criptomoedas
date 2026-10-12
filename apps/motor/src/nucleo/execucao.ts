import type { EstadoDecisao, OrdemDTO, ResultadoOrdem, RoboConfig } from "@zentrade/contratos";
import { ativosDoSimbolo } from "@zentrade/corretora";
import { arredondarParaBaixo, paraTexto, posicaoDe, type Lado, type Valor } from "@zentrade/dominio";
import { idClienteDe } from "../id-cliente.js";
import { mudarEstado, publicar, type DecisaoRegistrada } from "./diario.js";
import type { Plano } from "./plano.js";
import { quantidadeVenda } from "./protecao.js";
import { liberarProtecao } from "./stop-corretora.js";
import type { Dependencias, ResultadoCiclo } from "./tipos.js";

export function ordemDTO(
  decisaoId: string,
  robo: RoboConfig,
  lado: Lado,
  quantidade: Valor,
  r: ResultadoOrdem,
  criadaEm: number,
): OrdemDTO {
  return {
    id: r.idCliente,
    decisaoId,
    idCliente: r.idCliente,
    simbolo: robo.simbolo,
    lado,
    quantidade: paraTexto(quantidade),
    estado: r.estado,
    criadaEm,
    execucoes: r.execucoes.map((e) => ({
      preco: paraTexto(e.preco),
      quantidade: paraTexto(e.quantidade),
      taxaCotacao: paraTexto(e.taxaCotacao),
      em: e.em,
    })),
    ...(r.motivo ? { motivo: r.motivo } : {}),
  };
}

async function enviar(
  deps: Dependencias,
  robo: RoboConfig,
  lado: Lado,
  quantidade: Valor,
  idCliente: string,
): Promise<ResultadoOrdem> {
  try {
    return await deps.corretora.enviarOrdemMercado({ simbolo: robo.simbolo, lado, quantidade, idCliente });
  } catch (erro) {
    // Rejeições definitivas já voltam como REJEITADA; um erro aqui quer dizer que não se
    // sabe se a ordem entrou. Fica PENDENTE e ninguém reenvia até alguém conferir.
    const detalhe = erro instanceof Error ? erro.message : String(erro);
    deps.registro.error({ erro, roboId: robo.id, idCliente }, "falha ao enviar ordem: estado incerto");
    return {
      idCliente,
      idCorretora: null,
      estado: "PENDENTE",
      execucoes: [],
      motivo: `Estado incerto: ${detalhe} Confira a ordem ${idCliente} na corretora.`,
    };
  }
}

/**
 * Execução idempotente: reserva o idCliente (derivado da decisão) ANTES de enviar.
 * "ja_existe" = esta decisão já foi enviada; não se envia de novo. `null` nesse caso.
 */
export async function executarOrdem(
  deps: Dependencias,
  robo: RoboConfig,
  decisaoId: string,
  lado: Lado,
  quantidade: Valor,
): Promise<ResultadoOrdem | null> {
  const idCliente = idClienteDe(decisaoId);
  const criadaEm = deps.relogio.agora();
  const reserva = await deps.ordens.reservar({
    decisaoId,
    roboId: robo.id,
    idCliente,
    simbolo: robo.simbolo,
    lado,
    quantidade,
  });
  if (reserva === "ja_existe") {
    deps.registro.warn({ roboId: robo.id, idCliente }, "ordem já reservada: não reenviada");
    return null;
  }
  // "Ordem enviada": a tela vê a ordem sair antes da resposta da corretora.
  const enviada = { idCliente, idCorretora: null, estado: "PENDENTE" as const, execucoes: [] };
  await publicar(deps, {
    tipo: "ordem",
    ordem: ordemDTO(decisaoId, robo, lado, quantidade, enviada, criadaEm),
  });
  const resultado = await enviar(deps, robo, lado, quantidade, idCliente);
  await deps.ordens.concluir(idCliente, resultado);
  await publicar(deps, {
    tipo: "ordem",
    ordem: ordemDTO(decisaoId, robo, lado, quantidade, resultado, criadaEm),
  });
  if (resultado.estado === "REJEITADA")
    deps.registro.warn(
      { roboId: robo.id, idCliente, motivo: resultado.motivo },
      "ordem rejeitada pela corretora",
    );
  return resultado;
}

const PROTECAO_PRESA = {
  codigo: "protecao_presa",
  mensagem:
    "Não deu para tirar a proteção do livro da corretora: a venda do robô não saiu, para não vender duas vezes. A proteção segue valendo; o robô tenta de novo no próximo candle.",
};

const POSICAO_VENDIDA = {
  codigo: "posicao_zerada",
  mensagem: "A proteção na corretora já vendeu a posição: não há o que vender.",
};

/**
 * Venda do robô com proteção no livro: tira a proteção primeiro (ela trava a base) e
 * vende o que sobrou — a posição de agora, sem passar do saldo livre da conta.
 */
async function prepararVenda(
  deps: Dependencias,
  robo: RoboConfig,
  plano: Plano,
): Promise<Plano | { estado: "falhou" | "barrada"; barreira: typeof PROTECAO_PRESA }> {
  if (!deps.protecoes) return plano;
  if ((await liberarProtecao(deps, robo)) === "presa") return { estado: "falhou", barreira: PROTECAO_PRESA };
  const filtros = await deps.corretora.filtros(robo.simbolo);
  const posicao = posicaoDe(await deps.ordens.execucoes(robo.id));
  const livre = await deps.corretora.saldoLivre(ativosDoSimbolo(robo.simbolo).base);
  const naPosicao = quantidadeVenda(posicao.quantidade, filtros);
  const noSaldo = arredondarParaBaixo(livre, filtros.passoQuantidade);
  const quantidade = naPosicao.lt(noSaldo) ? naPosicao : noSaldo;
  if (quantidade.isZero()) return { estado: "barrada", barreira: POSICAO_VENDIDA };
  return { ...plano, quantidade };
}

/** Envia a ordem da decisão e grava o estado: executada se houve execução; senão, falhou. */
export async function executarDecisao(
  deps: Dependencias,
  robo: RoboConfig,
  registrada: DecisaoRegistrada,
  planoDecidido: Plano,
): Promise<ResultadoCiclo> {
  const plano =
    planoDecidido.lado === "VENDA" ? await prepararVenda(deps, robo, planoDecidido) : planoDecidido;
  if (!("lado" in plano)) {
    const risco = { aprovada: false, barreiras: [{ ...plano.barreira }] };
    await mudarEstado(deps, registrada, plano.estado, { risco });
    return { estado: plano.estado, plano: planoDecidido };
  }
  const ordem = await executarOrdem(deps, robo, registrada.id, plano.lado, plano.quantidade);
  if (!ordem) return { estado: registrada.decisao.estado, plano };
  const estado: EstadoDecisao = ordem.execucoes.length > 0 ? "executada" : "falhou";
  await mudarEstado(deps, registrada, estado, { ordemId: ordem.idCliente });
  return { estado, plano, ordem, decisaoId: registrada.id };
}
