import type { EstadoRisco, Posicao, Valor } from "@zentrade/dominio";
import type { Dependencias } from "./tipos.js";

const DIA_MS = 86_400_000;
const HORA_MS = 3_600_000;

/** 00:00 UTC do dia de `agora`: o "resultado do dia" do risco conta a partir daqui. */
export const inicioDoDia = (agora: number): number => agora - (agora % DIA_MS);

/** Quanto da moeda de cotação está exposto na posição, ao preço de referência. */
export const exposicao = (p: Posicao, preco: Valor): Valor => p.quantidade.times(preco);

/**
 * Estado do risco lido das portas na hora da decisão. A parada total vem de
 * PortaRobos.pausado a cada chamada — nunca de cache: quem aperta o botão de parar
 * precisa ser obedecido já na decisão seguinte.
 */
export async function montarEstadoRisco(
  deps: Dependencias,
  roboId: string,
  exposicaoAtual: Valor,
): Promise<EstadoRisco> {
  const agora = deps.relogio.agora();
  const [pausado, resultadoDoDia, ordensUltimaHora, ultimaPerdaEm, conta] = await Promise.all([
    deps.robos.pausado(roboId),
    deps.ordens.resultadoDesde(roboId, inicioDoDia(agora)),
    deps.ordens.contarDesde(roboId, agora - HORA_MS),
    deps.ordens.ultimaPerdaEm(roboId),
    deps.riscoConta?.estado(roboId, agora),
  ]);
  return {
    pausado,
    resultadoDoDia,
    exposicaoAtual,
    ordensUltimaHora,
    ultimaPerdaEm,
    agora,
    ...(conta ? { conta } : {}),
  };
}
