import type { OrdemPendente, ResultadoOrdem, RoboConfig } from "@zentrade/contratos";
import { publicar } from "./diario.js";
import { ordemDTO } from "./execucao.js";
import type { Dependencias } from "./tipos.js";

/** Ordem enviada sem resposta (ou reservada e o processo caiu): pode ter entrado ou não. */
export type OrdemIncerta = OrdemPendente;

/**
 * Confere na corretora uma ordem de estado incerto, pelo idCliente, e grava o que de
 * fato aconteceu. Enquanto não der para conferir, o robô não decide: decidir com a
 * posição errada é o caminho da compra em dobro. Devolve o que de fato aconteceu, ou
 * `null` se ainda não deu para conferir.
 */
export async function conferirOrdemIncerta(
  deps: Dependencias,
  robo: RoboConfig,
  incerta: OrdemIncerta,
): Promise<ResultadoOrdem | null> {
  let encontrada: ResultadoOrdem | null;
  try {
    encontrada = await deps.corretora.consultarOrdem(robo.simbolo, incerta.idCliente);
  } catch (erro) {
    deps.registro.error(
      { erro, roboId: robo.id, idCliente: incerta.idCliente },
      "não deu para conferir a ordem incerta; decisões suspensas até conferir",
    );
    return null;
  }
  const resultado: ResultadoOrdem = encontrada ?? {
    idCliente: incerta.idCliente,
    idCorretora: null,
    estado: "REJEITADA",
    execucoes: [],
    motivo: "A ordem de estado incerto não consta na corretora: não entrou e não foi reenviada.",
  };
  await deps.ordens.concluir(incerta.idCliente, resultado);
  if (resultado.execucoes.length > 0) await deps.decisoes.mudarEstado(incerta.decisaoId, "executada");
  await publicar(deps, {
    tipo: "ordem",
    ordem: ordemDTO(incerta.decisaoId, robo, incerta.lado, incerta.quantidade, resultado, incerta.criadaEm),
  });
  deps.registro.info(
    { roboId: robo.id, idCliente: incerta.idCliente, estado: resultado.estado },
    "ordem incerta conferida",
  );
  return resultado;
}
