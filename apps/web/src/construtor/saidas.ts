import type { Estrategia, StopMovel } from "@zentrade/dominio";
import { lerDecimalDigitado, paraCampo } from "../lib/entrada";

/**
 * As saídas além do stop fixo e do alvo, como a pessoa digita (texto) e como o
 * domínio quer (número). Percentuais na tela, frações no domínio.
 */
export type TipoStop = "percentual" | "atr";
export type TipoMovel = "desligado" | "percentual" | "atr";

export interface EstadoSaidas {
  readonly tipoStop: TipoStop;
  readonly stopAtrPeriodo: string;
  readonly stopAtrMultiplo: string;
  readonly movel: TipoMovel;
  readonly movelDistancia: string;
  readonly movelPeriodo: string;
  readonly movelMultiplo: string;
  readonly empate: boolean;
  readonly empateGatilho: string;
  readonly tempo: boolean;
  readonly tempoCandles: string;
  readonly tamanho: boolean;
  readonly tamanhoPeriodo: string;
  readonly tamanhoMultiplo: string;
  /** Tamanho por alocação: fração da exposição máxima, sem olhar o risco por operação. */
  readonly alocacao: boolean;
  /** Em %, como a pessoa digita (100 = a exposição máxima inteira). */
  readonly alocacaoFracao: string;
}

export const SAIDAS_PADRAO: EstadoSaidas = {
  tipoStop: "percentual",
  stopAtrPeriodo: "14",
  stopAtrMultiplo: "2",
  movel: "desligado",
  movelDistancia: "3",
  movelPeriodo: "14",
  movelMultiplo: "3",
  empate: false,
  empateGatilho: "2",
  tempo: false,
  tempoCandles: "24",
  tamanho: false,
  tamanhoPeriodo: "14",
  tamanhoMultiplo: "2",
  alocacao: false,
  alocacaoFracao: "100",
};

/** Os campos opcionais de saída do domínio. */
export type CamposSaida = Pick<
  Estrategia,
  "stopAtr" | "stopMovel" | "empate" | "tempoMaximo" | "tamanhoPorVolatilidade" | "tamanhoPorAlocacao"
>;

/** Os mesmos campos vindos do DTO, onde opcional também aceita `undefined`. */
type CamposSaidaDTO = { readonly [K in keyof CamposSaida]?: CamposSaida[K] | undefined };

/** Percentual digitado ("2,5") → fração (0.025). Só para os parâmetros, não é dinheiro. */
export function fracaoDe(texto: string): number | null {
  const v = lerDecimalDigitado(texto);
  return v === null ? null : Number(v) / 100;
}

export const percentual = (fracao: number): string => paraCampo(String(Math.round(fracao * 10_000) / 100));
const numeroCampo = (n: number): string => paraCampo(String(n));

export function saidasDe(e: CamposSaidaDTO): EstadoSaidas {
  const s = SAIDAS_PADRAO;
  const movel = e.stopMovel;
  return {
    tipoStop: e.stopAtr ? "atr" : "percentual",
    stopAtrPeriodo: e.stopAtr ? String(e.stopAtr.periodo) : s.stopAtrPeriodo,
    stopAtrMultiplo: e.stopAtr ? numeroCampo(e.stopAtr.multiplo) : s.stopAtrMultiplo,
    movel: movel?.tipo ?? "desligado",
    movelDistancia: movel?.tipo === "percentual" ? percentual(movel.distancia) : s.movelDistancia,
    movelPeriodo: movel?.tipo === "atr" ? String(movel.periodo) : s.movelPeriodo,
    movelMultiplo: movel?.tipo === "atr" ? numeroCampo(movel.multiplo) : s.movelMultiplo,
    empate: e.empate !== undefined,
    empateGatilho: e.empate ? percentual(e.empate.gatilho) : s.empateGatilho,
    tempo: e.tempoMaximo !== undefined,
    tempoCandles: e.tempoMaximo !== undefined ? String(e.tempoMaximo) : s.tempoCandles,
    tamanho: e.tamanhoPorVolatilidade !== undefined,
    tamanhoPeriodo: e.tamanhoPorVolatilidade ? String(e.tamanhoPorVolatilidade.periodo) : s.tamanhoPeriodo,
    tamanhoMultiplo: e.tamanhoPorVolatilidade
      ? numeroCampo(e.tamanhoPorVolatilidade.multiplo)
      : s.tamanhoMultiplo,
    alocacao: e.tamanhoPorAlocacao !== undefined,
    alocacaoFracao: e.tamanhoPorAlocacao ? percentual(e.tamanhoPorAlocacao.fracao) : s.alocacaoFracao,
  };
}

const inteiroDe = (texto: string): number | null =>
  /^\d+$/.test(texto.trim()) ? Number(texto.trim()) : null;
function numeroDe(texto: string): number | null {
  const v = lerDecimalDigitado(texto);
  return v === null ? null : Number(v);
}

export interface LeituraSaidas {
  readonly campos: CamposSaida;
  readonly problemas: readonly string[];
}

/** Texto → campos do domínio. O que não dá para ler vira problema; as faixas ficam com o domínio. */
export function lerSaidas(s: EstadoSaidas): LeituraSaidas {
  const problemas: string[] = [];
  const atr = (periodo: string, multiplo: string, onde: string) => {
    const p = inteiroDe(periodo);
    const m = numeroDe(multiplo);
    if (p === null) problemas.push(`o período do ATR ${onde} precisa ser um número inteiro, como 14`);
    if (m === null) problemas.push(`o múltiplo do ATR ${onde} precisa ser um número, como 2`);
    return p === null || m === null ? null : { periodo: p, multiplo: m };
  };

  const stopAtr = s.tipoStop === "atr" ? atr(s.stopAtrPeriodo, s.stopAtrMultiplo, "do stop") : null;
  let stopMovel: StopMovel | null = null;
  if (s.movel === "percentual") {
    const distancia = fracaoDe(s.movelDistancia);
    if (distancia === null) problemas.push("a distância do stop móvel precisa ser um número, como 3");
    else stopMovel = { tipo: "percentual", distancia };
  }
  if (s.movel === "atr") {
    const uso = atr(s.movelPeriodo, s.movelMultiplo, "do stop móvel");
    if (uso) stopMovel = { tipo: "atr", ...uso };
  }
  const gatilho = s.empate ? fracaoDe(s.empateGatilho) : null;
  if (s.empate && gatilho === null) problemas.push("o gatilho do empate precisa ser um número, como 2");
  const tempo = s.tempo ? inteiroDe(s.tempoCandles) : null;
  if (s.tempo && tempo === null)
    problemas.push("o tempo máximo precisa ser um número inteiro de candles, como 24");
  const tamanho = s.tamanho ? atr(s.tamanhoPeriodo, s.tamanhoMultiplo, "do tamanho") : null;
  const alocacao = s.alocacao ? fracaoDe(s.alocacaoFracao) : null;
  if (s.alocacao && alocacao === null) problemas.push("a fração da alocação precisa ser um número, como 100");

  return {
    campos: {
      ...(stopAtr ? { stopAtr } : {}),
      ...(stopMovel ? { stopMovel } : {}),
      ...(gatilho !== null ? { empate: { gatilho } } : {}),
      ...(tempo !== null ? { tempoMaximo: tempo } : {}),
      ...(tamanho ? { tamanhoPorVolatilidade: tamanho } : {}),
      ...(alocacao !== null ? { tamanhoPorAlocacao: { fracao: alocacao } } : {}),
    },
    problemas,
  };
}
