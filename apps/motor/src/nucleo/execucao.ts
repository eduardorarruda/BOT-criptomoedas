import type { OrdemDTO, ResultadoOrdem, RoboConfig } from "@zentrade/contratos";
import { paraTexto, type Lado, type Valor } from "@zentrade/dominio";
import { idClienteDe } from "../id-cliente.js";
import { publicar } from "./diario.js";
import type { Dependencias } from "./tipos.js";

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
