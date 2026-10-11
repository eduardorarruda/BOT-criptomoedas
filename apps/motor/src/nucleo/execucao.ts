import type { EstadoDecisao, OrdemDTO, ResultadoOrdem, RoboConfig } from "@zentrade/contratos";
import { paraTexto, type Lado, type Valor } from "@zentrade/dominio";
import { idClienteDe } from "../id-cliente.js";
import { mudarEstado, publicar, type DecisaoRegistrada } from "./diario.js";
import type { Plano } from "./plano.js";
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

/** Envia a ordem da decisão e grava o estado: executada se houve execução; senão, falhou. */
export async function executarDecisao(
  deps: Dependencias,
  robo: RoboConfig,
  registrada: DecisaoRegistrada,
  plano: Plano,
): Promise<ResultadoCiclo> {
  const ordem = await executarOrdem(deps, robo, registrada.id, plano.lado, plano.quantidade);
  if (!ordem) return { estado: registrada.decisao.estado, plano };
  const estado: EstadoDecisao = ordem.execucoes.length > 0 ? "executada" : "falhou";
  await mudarEstado(deps, registrada, estado, { ordemId: ordem.idCliente });
  return { estado, plano, ordem, decisaoId: registrada.id };
}
