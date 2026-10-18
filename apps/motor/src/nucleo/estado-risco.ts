import { inicioDoDiaNoFuso, type EstadoRisco, type Posicao, type Valor } from "@zentrade/dominio";
import type { Dependencias } from "./tipos.js";

const HORA_MS = 3_600_000;

/**
 * 00:00 do dia de `agora` no fuso da instância (ZENTRADE_FUSO): o "resultado do dia" do
 * risco conta a partir daqui. Antes era a meia-noite UTC, e a perda do dia zerava às 21h
 * de Brasília.
 */
export const inicioDoDia = (agora: number, fuso: string): number => inicioDoDiaNoFuso(agora, fuso);

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
    deps.ordens.resultadoDesde(roboId, inicioDoDia(agora, deps.opcoes.fuso)),
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
