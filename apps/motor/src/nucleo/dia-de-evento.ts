import type { RoboConfig } from "@zentrade/contratos";
import {
  diaNoFuso,
  eventoDeAltoImpactoNoInstante,
  fusoDoMercado,
  mercadoDoSimbolo,
  type DiaDeEvento,
} from "@zentrade/dominio";
import type { Dependencias } from "./tipos.js";

/**
 * O filtro opcional de dia de evento, na hora de ABRIR posição: se o robô pediu para
 * respeitar os eventos (bloquear ou reduzir) e hoje, no fuso do mercado dele, há evento
 * de alto impacto, devolve o evento e o modo. Robô em "ignorar" nem consulta a agenda.
 * Se a agenda não responder, vale o lado seguro para quem pediu o filtro: trata como dia
 * de evento (só a entrada é afetada; saída e stop nunca passam por aqui).
 */
export async function diaDeEventoDaEntrada(
  deps: Dependencias,
  robo: RoboConfig,
): Promise<DiaDeEvento | undefined> {
  const modo = robo.limites.diasDeEvento ?? "ignorar";
  if (modo === "ignorar" || !deps.agendaEventos) return undefined;
  const mercado = mercadoDoSimbolo(robo.simbolo);
  const agora = deps.relogio.agora();
  const fuso = fusoDoMercado(mercado, deps.opcoes.fuso);
  try {
    const eventos = await deps.agendaEventos.doDia(robo.id, diaNoFuso(agora, fuso));
    const evento = eventoDeAltoImpactoNoInstante(eventos, mercado, agora, deps.opcoes.fuso);
    return evento ? { modo, titulo: evento.titulo } : undefined;
  } catch (erro) {
    deps.registro.error(
      { erro, roboId: robo.id },
      "agenda de eventos indisponível: a entrada do robô com filtro de dia de evento fica barrada, a saída segue",
    );
    return { modo, titulo: "não foi possível consultar a agenda de eventos, por precaução" };
  }
}
