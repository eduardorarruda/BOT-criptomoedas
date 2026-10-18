import { chaveDiaNoFuso, diaNoFuso, horaNoFuso } from "../fuso.js";

/**
 * O pregão do mini índice em America/Sao_Paulo (veja a nota 02 da base de
 * conhecimento). Desde 9/3/2026 o WIN negocia das 9h00 às 18h25, com call de
 * fechamento às 18h25. O backtest decide no FECHAMENTO de cada candle; o instante
 * da decisão é o fim do candle (abertura + duração).
 *
 * - Entradas só em [início, corte): nada de abrir na pré-abertura, nos primeiros
 *   minutos, nem perto do fechamento.
 * - Zeragem: a posição fecha no fechamento do primeiro candle que termina na hora da
 *   zeragem ou depois (e, de todo modo, no último candle do dia): nada dorme posicionado.
 * - O primeiro candle do dia carrega o leilão de abertura: pode ser pulado nas entradas.
 */
export const FUSO_B3 = "America/Sao_Paulo";

export interface SessaoB3 {
  /** "HH:MM" de Brasília: a partir de quando se pode abrir posição. */
  readonly inicioEntradas: string;
  /** "HH:MM": a partir de quando não se abre mais posição. */
  readonly fimEntradas: string;
  /** "HH:MM": zera tudo no fechamento do candle que termina nesta hora ou depois. */
  readonly zeragem: string;
  /** Não abre posição no fechamento do primeiro candle do dia (leilão de abertura). */
  readonly pularLeilaoAbertura: boolean;
}

export const SESSAO_B3_PADRAO: SessaoB3 = {
  inicioEntradas: "09:15",
  fimEntradas: "17:30",
  zeragem: "18:15",
  pularLeilaoAbertura: true,
};

export interface HoraB3 {
  /** Data local, "AAAA-MM-DD". */
  readonly dia: string;
  /** Minutos desde a meia-noite local. */
  readonly minutos: number;
}

/** O dia e a hora de Brasília de um instante UTC (ms). */
export function horaB3(ms: number): HoraB3 {
  const h = horaNoFuso(ms, FUSO_B3);
  return { dia: h.dia, minutos: h.minutos };
}

export const diaB3 = (ms: number): string => diaNoFuso(ms, FUSO_B3);

/** O dia de Brasília como número (dias desde 1970): para comparar dias sem montar texto. */
export const chaveDiaB3 = (ms: number): number => chaveDiaNoFuso(ms, FUSO_B3);

const HORARIO = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** "09:15" → 555. */
export function minutosDoHorario(hhmm: string): number {
  const m = HORARIO.exec(hhmm);
  if (!m) throw new RangeError(`horário inválido: ${hhmm} (use HH:MM, como 09:15)`);
  return Number(m[1]) * 60 + Number(m[2]);
}

export function problemasSessao(s: SessaoB3): string[] {
  const invalidos = [s.inicioEntradas, s.fimEntradas, s.zeragem].filter((h) => !HORARIO.test(h));
  if (invalidos.length) return invalidos.map((h) => `horário inválido: ${h} (use HH:MM, como 09:15)`);
  const problemas: string[] = [];
  if (minutosDoHorario(s.inicioEntradas) >= minutosDoHorario(s.fimEntradas))
    problemas.push("o início das entradas precisa ser antes do corte das entradas");
  if (minutosDoHorario(s.zeragem) < minutosDoHorario(s.fimEntradas))
    problemas.push("a zeragem precisa ser no corte das entradas ou depois");
  return problemas;
}

/**
 * Pode abrir posição na decisão tomada em `instante` (o fim do candle)? `primeiroDoDia`:
 * o candle é o primeiro do pregão nos dados (o do leilão de abertura).
 */
export function podeAbrirNaSessao(
  instante: number,
  s: SessaoB3,
  primeiroDoDia: boolean,
): { readonly pode: boolean; readonly motivo: string | null } {
  const { minutos } = horaB3(instante);
  if (minutos < minutosDoHorario(s.inicioEntradas))
    return { pode: false, motivo: `antes das ${s.inicioEntradas}, o início das entradas` };
  if (minutos >= minutosDoHorario(s.fimEntradas))
    return { pode: false, motivo: `depois das ${s.fimEntradas}, o corte das entradas` };
  if (primeiroDoDia && s.pularLeilaoAbertura)
    return { pode: false, motivo: "primeiro candle do pregão (leilão de abertura)" };
  return { pode: true, motivo: null };
}

/** A decisão em `instante` (o fim do candle) já é na hora de zerar ou depois? */
export const deveZerar = (instante: number, s: SessaoB3): boolean =>
  horaB3(instante).minutos >= minutosDoHorario(s.zeragem);

/** O fim de um candle (o instante da decisão) a partir da abertura e do fechamento gravados. */
export const fimDoCandle = (c: { readonly fechamento: number }): number => c.fechamento + 1;
