import type { EstadoRisco, Valor } from "@zentrade/dominio";
import type { Dependencias } from "./tipos.js";

const DIA_MS = 86_400_000;
const HORA_MS = 3_600_000;

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
  const inicioDoDia = agora - (agora % DIA_MS); // 00:00 UTC
  const [pausado, resultadoDoDia, ordensUltimaHora, ultimaPerdaEm] = await Promise.all([
    deps.robos.pausado(roboId),
    deps.ordens.resultadoDesde(roboId, inicioDoDia),
    deps.ordens.contarDesde(roboId, agora - HORA_MS),
    deps.ordens.ultimaPerdaEm(roboId),
  ]);
  return { pausado, resultadoDoDia, exposicaoAtual, ordensUltimaHora, ultimaPerdaEm, agora };
}
