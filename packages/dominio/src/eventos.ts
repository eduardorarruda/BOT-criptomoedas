import { horaNoFuso } from "./fuso.js";
import { FUSO_B3, minutosDoHorario } from "./mercados/index.js";
import type { Mercado } from "./mercados/index.js";

/**
 * Agenda de eventos de mercado (Copom, payroll, eleição…) e o filtro opcional de "dia
 * perigoso" por robô. O filtro nasce DESLIGADO: nos 20 pregões medidos do WIN, tirar os
 * dias de evento piorou as estratégias de tendência (os ganhos grandes delas vêm desses
 * dias) e só ajudou um pouco a volta à média. Quem liga escolhe com os olhos abertos.
 */
export type ImpactoEvento = "alto" | "medio";
export type MercadoDoEvento = Mercado | "todos";
export type OrigemEvento = "manual" | "sugerido";

/** O que o robô faz em dia de evento de alto impacto antes de ABRIR posição. */
export type ModoDiasDeEvento = "ignorar" | "bloquear" | "reduzir";
export const MODOS_DIAS_DE_EVENTO: readonly ModoDiasDeEvento[] = ["ignorar", "bloquear", "reduzir"];

export interface EventoMercado {
  /** O dia no fuso do mercado, "AAAA-MM-DD". */
  readonly data: string;
  readonly mercado: MercadoDoEvento;
  readonly titulo: string;
  readonly impacto: ImpactoEvento;
  /** Janela de horário opcional (HH:MM, no fuso do mercado). Sem janela, vale o dia todo. */
  readonly de?: string | null;
  readonly ate?: string | null;
}

/** O evento que está valendo agora: o que a barreira cita. */
export interface DiaDeEvento {
  readonly modo: ModoDiasDeEvento;
  readonly titulo: string;
}

/** O fuso em que o dia do evento é contado: a B3 para o WIN; o da instância para a cripto. */
export const fusoDoMercado = (mercado: Mercado, fusoDaInstancia: string): string =>
  mercado === "win" ? FUSO_B3 : fusoDaInstancia;

function naJanela(e: EventoMercado, minutos: number): boolean {
  const de = e.de ? minutosDoHorario(e.de) : 0;
  const ate = e.ate ? minutosDoHorario(e.ate) : 24 * 60;
  return minutos >= de && minutos <= ate;
}

/**
 * O evento de alto impacto que vale para o mercado no instante, ou null. O dia é o do
 * fuso do mercado. Com janela de horário, só vale dentro dela (inclusive nas pontas).
 */
export function eventoDeAltoImpactoNoInstante(
  eventos: readonly EventoMercado[],
  mercado: Mercado,
  instante: number,
  fusoDaInstancia: string,
): EventoMercado | null {
  const h = horaNoFuso(instante, fusoDoMercado(mercado, fusoDaInstancia));
  return (
    eventos.find(
      (e) =>
        e.impacto === "alto" &&
        e.data === h.dia &&
        (e.mercado === "todos" || e.mercado === mercado) &&
        naJanela(e, h.minutos),
    ) ?? null
  );
}

/** Quanto do tamanho normal a entrada leva no modo: "reduzir" = metade. */
export const fatorDoModoDeEvento = (modo: ModoDiasDeEvento): number => (modo === "reduzir" ? 0.5 : 1);

/** O "dia de evento: …" que a barreira e as telas mostram. */
export const motivoDiaDeEvento = (titulo: string): string => `dia de evento: ${titulo}`;
