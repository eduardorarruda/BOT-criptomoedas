import { media } from "./serie.js";

/**
 * O cenário de mercado de um ativo, lido SÓ dos candles já fechados (nada do futuro).
 *
 * Critério, simples de propósito (os números que o justificam vêm junto da leitura):
 * - alta:    o preço está acima da média de 200 velas E essa média sobe mais que o limiar;
 * - queda:   o preço está abaixo da média de 200 velas E essa média cai mais que o limiar;
 * - lateral: o resto (preço colado na média, média parada, ou preço e média discordando,
 *            como um repique no meio de uma queda).
 * O limiar é meio ATR por 50 velas (mínimo de 0,05%): assim vale em qualquer ativo e
 * intervalo, porque "parada" depende de quanto o preço costuma andar. Sem máximas e
 * mínimas (sem ATR) vale 0,3%. Menos de 250 velas não dá para medir a inclinação:
 * "indefinido", nunca um palpite.
 */
export type CenarioMercado = "alta" | "queda" | "lateral" | "indefinido";

export const PERIODO_MEDIA = 200;
export const PERIODO_MEDIA_LONGA = 400;
export const VELAS_INCLINACAO = 50;
export const VELAS_MINIMAS = PERIODO_MEDIA + VELAS_INCLINACAO;
export const PERIODO_ATR = 14;
export const PERIODO_EFICIENCIA = 20;
export const JANELA_PERCENTIL_ATR = 300;
export const LIMIAR_EM_ATR = 0.5;
export const LIMIAR_SEM_ATR = 0.3;
export const PISO_LIMIAR = 0.05;
const MS_7_DIAS = 7 * 24 * 3_600_000;

export interface SerieMercado {
  readonly fechamentos: readonly number[];
  readonly maximas?: readonly number[];
  readonly minimas?: readonly number[];
}

export interface LeituraCenario {
  readonly cenario: CenarioMercado;
  /** Distância do preço à média de 200 velas, em % (positivo = acima). */
  readonly precoVsSma200: number | null;
  readonly precoVsSma400: number | null;
  /** Quanto a média de 200 velas andou nas últimas 50 velas, em %. */
  readonly inclinacaoSma200: number | null;
  /** A partir de quanto a inclinação conta como tendência, em %. */
  readonly limiarInclinacao: number | null;
  /** Variação do preço em 7 dias (ou na janela que existe), em %. */
  readonly variacao7d: number | null;
  readonly janelaVariacaoHoras: number | null;
  readonly atrPct: number | null;
  /** 0 a 100: em que fatia das últimas velas a volatilidade de agora se encaixa. */
  readonly atrPercentil: number | null;
  /** Eficiência de Kaufman, 0 a 1: 1 = o preço foi reto, 0 = foi e voltou. */
  readonly eficiencia: number | null;
  readonly texto: string;
}

export interface OpcoesCenario {
  /** Duração de uma vela em ms. */
  readonly intervaloMs: number;
}

const arredondar = (n: number): number => Math.round(n * 100) / 100;

const pct = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const pctComSinal = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1, signDisplay: "exceptZero" });

const mediaDas = (v: readonly number[], periodo: number, deslocamento = 0): number | null => {
  const fim = v.length - deslocamento;
  return fim < periodo ? null : media(v.slice(fim - periodo, fim));
};

/** ATR de Wilder em % do fechamento, vela a vela (uma passada só). */
function atrPctPorVela(s: SerieMercado): number[] {
  const { fechamentos: f, maximas: h, minimas: l } = s;
  if (!h || !l || h.length !== f.length || l.length !== f.length || f.length <= PERIODO_ATR) return [];
  const tr = (i: number): number => {
    const anterior = f[i - 1] as number;
    const alta = h[i] as number;
    const baixa = l[i] as number;
    return Math.max(alta - baixa, Math.abs(alta - anterior), Math.abs(baixa - anterior));
  };
  let atr = 0;
  for (let i = 1; i <= PERIODO_ATR; i++) atr += tr(i) / PERIODO_ATR;
  const saida = [(atr / (f[PERIODO_ATR] as number)) * 100];
  for (let i = PERIODO_ATR + 1; i < f.length; i++) {
    atr = (atr * (PERIODO_ATR - 1) + tr(i)) / PERIODO_ATR;
    saida.push((atr / (f[i] as number)) * 100);
  }
  return saida;
}

function percentil(serie: readonly number[]): number | null {
  const janela = serie.slice(-JANELA_PERCENTIL_ATR);
  if (janela.length < 30) return null;
  const atual = janela[janela.length - 1] as number;
  return (janela.filter((x) => x <= atual).length / janela.length) * 100;
}

function eficienciaDeKaufman(f: readonly number[]): number | null {
  if (f.length <= PERIODO_EFICIENCIA) return null;
  const janela = f.slice(-(PERIODO_EFICIENCIA + 1));
  let caminho = 0;
  for (let i = 1; i < janela.length; i++)
    caminho += Math.abs((janela[i] as number) - (janela[i - 1] as number));
  const liquido = Math.abs((janela[janela.length - 1] as number) - (janela[0] as number));
  return caminho === 0 ? 0 : liquido / caminho;
}

function variacaoDaJanela(f: readonly number[], intervaloMs: number) {
  const velas7d = Math.max(1, Math.round(MS_7_DIAS / intervaloMs));
  const janela = Math.min(velas7d, f.length - 1);
  if (janela < 1) return { variacao: null, horas: null };
  const base = f[f.length - 1 - janela] as number;
  const atual = f[f.length - 1] as number;
  return {
    variacao: base === 0 ? null : arredondar((atual / base - 1) * 100),
    horas: arredondar((janela * intervaloMs) / 3_600_000),
  };
}

function descreverMedia(inclinacao: number, limiar: number): string {
  if (Math.abs(inclinacao) <= limiar) return "está quase parada";
  return `${inclinacao > 0 ? "sobe" : "cai"} ${pct.format(Math.abs(inclinacao))}% em ${VELAS_INCLINACAO} velas`;
}

const NADA = {
  precoVsSma200: null,
  precoVsSma400: null,
  inclinacaoSma200: null,
  limiarInclinacao: null,
  variacao7d: null,
  janelaVariacaoHoras: null,
  atrPct: null,
  atrPercentil: null,
  eficiencia: null,
} as const;

const NOME: Record<Exclude<CenarioMercado, "indefinido">, string> = {
  alta: "Alta",
  queda: "Queda",
  lateral: "Lateral",
};

/** Lê o cenário do último candle fechado da série. */
export function lerCenario(s: SerieMercado, o: OpcoesCenario): LeituraCenario {
  const f = s.fechamentos;
  if (f.length < VELAS_MINIMAS)
    return {
      ...NADA,
      cenario: "indefinido",
      texto: `Sem histórico para o cenário: faltam ${VELAS_MINIMAS - f.length} velas (precisa de ${VELAS_MINIMAS}).`,
    };
  const preco = f[f.length - 1] as number;
  const sma200 = mediaDas(f, PERIODO_MEDIA) as number;
  const sma200Antes = mediaDas(f, PERIODO_MEDIA, VELAS_INCLINACAO) as number;
  const sma400 = mediaDas(f, PERIODO_MEDIA_LONGA);
  const distancia = (preco / sma200 - 1) * 100;
  const inclinacao = (sma200 / sma200Antes - 1) * 100;
  const atrs = atrPctPorVela(s);
  const atrPct = atrs.length > 0 ? (atrs[atrs.length - 1] as number) : null;
  const limiar = atrPct === null ? LIMIAR_SEM_ATR : Math.max(PISO_LIMIAR, LIMIAR_EM_ATR * atrPct);
  const cenario: Exclude<CenarioMercado, "indefinido"> =
    distancia > 0 && inclinacao > limiar
      ? "alta"
      : distancia < 0 && inclinacao < -limiar
        ? "queda"
        : "lateral";
  const { variacao, horas } = variacaoDaJanela(f, o.intervaloMs);
  const lado = distancia >= 0 ? "acima" : "abaixo";
  const andou = variacao === null ? "" : `; em 7 dias andou ${pctComSinal.format(variacao)}%`;
  const eficiencia = eficienciaDeKaufman(f);
  const percentilAtr = percentil(atrs);
  const atrPercentilArredondado = percentilAtr === null ? null : Math.round(percentilAtr);
  return {
    cenario,
    precoVsSma200: arredondar(distancia),
    precoVsSma400: sma400 === null ? null : arredondar((preco / sma400 - 1) * 100),
    inclinacaoSma200: arredondar(inclinacao),
    limiarInclinacao: arredondar(limiar),
    variacao7d: variacao,
    janelaVariacaoHoras: horas,
    atrPct: atrPct === null ? null : arredondar(atrPct),
    atrPercentil: atrPercentilArredondado,
    eficiencia: eficiencia === null ? null : arredondar(eficiencia),
    texto: `${NOME[cenario]}: o preço está ${pct.format(Math.abs(distancia))}% ${lado} da média de ${PERIODO_MEDIA} velas, que ${descreverMedia(inclinacao, limiar)}${andou}.`,
  };
}
