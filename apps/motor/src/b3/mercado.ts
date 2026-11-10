import { MS_POR_INTERVALO, type Intervalo } from "@zentrade/contratos";
import { dec, horaB3, type Candle, type Estrategia, type Regra } from "@zentrade/dominio";
import { agregar } from "../dados-b3/agregar.js";

/**
 * O mini índice no motor: preço em REAIS POR CONTRATO (pontos × R$ 0,20). Assim a conta
 * do núcleo (quantidade × variação de preço) já sai em reais, e quantidade = contratos.
 * Os indicadores (Donchian, médias, ATR) não mudam com a escala: a regra decide igual.
 */
export const SIMBOLO_WIN_PAPEL = "WINBRL";
export const ATIVO_WIN = "WIN";
export const MOEDA_B3 = "BRL";
export const REAIS_POR_PONTO = 0.2;
export const PONTOS_POR_TICK = 5;
const CINCO_MIN = MS_POR_INTERVALO["5m"];
/**
 * A última vela de 5 min do pregão do WIN (18:20, desde 2026 em todos os dias): com ela,
 * o candle maior em que ela cai está fechado, sem esperar a próxima vela (só amanhã).
 */
const ULTIMA_VELA_DO_PREGAO_MIN = 18 * 60 + 20;

export const ehWinPapel = (simbolo: string): boolean => simbolo === SIMBOLO_WIN_PAPEL;

export function emReais(c: Candle): Candle {
  const r = dec(REAIS_POR_PONTO);
  return {
    ...c,
    abre: c.abre.times(r),
    maxima: c.maxima.times(r),
    minima: c.minima.times(r),
    fecha: c.fecha.times(r),
  };
}

/**
 * Os candles de `intervalo` montados das velas de 5 min, SÓ os fechados: o grupo fecha
 * quando chega a última vela dele ou qualquer vela depois (o pregão acabou antes).
 */
export function velasFechadas(velas5m: readonly Candle[], intervalo: Intervalo): Candle[] {
  if (intervalo === "5m" || intervalo === "1m") return [...velas5m];
  const ultima = velas5m.at(-1);
  if (!ultima) return [];
  const fimDoPregao = horaB3(ultima.abertura).minutos >= ULTIMA_VELA_DO_PREGAO_MIN;
  return agregar(velas5m, "5m", intervalo).filter(
    (g) => ultima.abertura >= g.fechamento + 1 - CINCO_MIN || (fimDoPregao && g.abertura <= ultima.abertura),
  );
}

export interface SessaoPregao {
  /** "HH:MM": a ordem de entrada só sai de inicioEntradas (inclusive) a fimEntradas. */
  readonly inicioEntradas: string;
  readonly fimEntradas: string;
  /** "HH:MM": a posição é zerada no último candle que fecha até aqui. */
  readonly zeragem: string;
  /** Não abre no fechamento do primeiro candle do dia (o do leilão de abertura), como no backtest. */
  readonly pularLeilaoAbertura: boolean;
}

const PREGAO_ABRE_MIN = 9 * 60;
const minutos = (hhmm: string): number => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};
const hhmm = (min: number): string =>
  `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
const horario = (de: number, ate: number): Regra => ({ tipo: "horario", de: hhmm(de), ate: hhmm(ate) });

/**
 * A estratégia congelada com a sessão do pregão, como o backtest do WIN (podeAbrirNaSessao
 * e deveZerar): a regra de horário lê a ABERTURA do candle, e a decisão sai no FIM dele.
 * Entra só se o fim cair em [inicioEntradas, fimEntradas) e, com o leilão pulado, nunca no
 * primeiro candle do dia (o das 09:00). Zera no primeiro candle, na grade do pregão, que
 * termina na zeragem ou depois (15m: o das 18:00; 1h: o das 18:00, fechado pela vela das
 * 18:20). A regra gravada no banco não muda.
 */
export function estrategiaNoPregao(e: Estrategia, intervalo: Intervalo, s: SessaoPregao): Estrategia {
  const iv = MS_POR_INTERVALO[intervalo] / 60_000;
  const primeiro = s.pularLeilaoAbertura ? PREGAO_ABRE_MIN + iv : PREGAO_ABRE_MIN;
  const janela = horario(Math.max(minutos(s.inicioEntradas) - iv, primeiro), minutos(s.fimEntradas) - iv);
  const zera = PREGAO_ABRE_MIN + Math.ceil((minutos(s.zeragem) - iv - PREGAO_ABRE_MIN) / iv) * iv;
  const zeragem = horario(zera, 23 * 60 + 59);
  return {
    ...e,
    entrada: { tipo: "e", regras: [e.entrada, janela] },
    saida: e.saida ? { tipo: "ou", regras: [e.saida, zeragem] } : zeragem,
  };
}
