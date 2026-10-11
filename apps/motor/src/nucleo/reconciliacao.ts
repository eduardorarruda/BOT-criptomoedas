import type { ResultadoOrdem, RoboConfig } from "@zentrade/contratos";
import type { Lado, Valor } from "@zentrade/dominio";
import { publicar } from "./diario.js";
import { ordemDTO } from "./execucao.js";
import type { Dependencias } from "./tipos.js";

/** Ordem enviada sem resposta: pode ter entrado ou não. */
export interface OrdemIncerta {
  readonly idCliente: string;
  readonly decisaoId: string;
  readonly lado: Lado;
  readonly quantidade: Valor;
  readonly criadaEm: number;
}

/**
 * Confere na corretora uma ordem de estado incerto, pelo idCliente, e grava o que de
 * fato aconteceu. Enquanto não der para conferir, o robô não decide: decidir com a
 * posição errada é o caminho da compra em dobro. `true` quando resolveu.
 */
export async function conferirOrdemIncerta(
  deps: Dependencias,
  robo: RoboConfig,
  incerta: OrdemIncerta,
): Promise<boolean> {
  let encontrada: ResultadoOrdem | null;
  try {
    encontrada = await deps.corretora.consultarOrdem(robo.simbolo, incerta.idCliente);
  } catch (erro) {
    deps.registro.error(
      { erro, roboId: robo.id, idCliente: incerta.idCliente },
      "não deu para conferir a ordem incerta; decisões suspensas até conferir",
    );
    return false;
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
  return true;
}
