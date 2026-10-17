import { hlcDe, serieDe, type ContextoMercado } from "./contexto.js";
import { formatarNumero } from "./formatar.js";
import { ema, rsi, sma } from "./indicadores.js";
import { faixaDeAbertura, vwapDoDia } from "./indicadores-sessao.js";
import { adx, estocastico, macd, momento, roc } from "./momento.js";
import { atr, bollinger, donchian } from "./volatilidade.js";
import { volumeMedio, volumeRelativo } from "./volume.js";

/**
 * Catálogo dos indicadores que a árvore de regras aceita: como cada um vira
 * operando, rótulo de explicação, valor e problema de validação. A tela monta o
 * editor a partir de `INDICADORES`, então um indicador novo nasce aqui.
 *
 * Indicadores com mais de uma saída (Bollinger, Donchian, MACD, estocástico, ADX)
 * pedem `saida`: o operando aponta para UMA linha do indicador.
 */
export type IndicadorSimples =
  "sma" | "ema" | "rsi" | "atr" | "roc" | "momento" | "volumeMedio" | "volumeRelativo";
export type SaidaBollinger = "media" | "superior" | "inferior" | "percentualB" | "largura";
export type SaidaDonchian = "superior" | "inferior" | "meio";
export type SaidaMacd = "macd" | "sinal" | "histograma";
export type SaidaEstocastico = "k" | "d";
export type SaidaAdx = "adx" | "maisDI" | "menosDI";
export type SaidaFaixaAbertura = "superior" | "inferior" | "meio";

export type OperandoIndicador =
  | { readonly tipo: "indicador"; readonly nome: IndicadorSimples; readonly periodo: number }
  | {
      readonly tipo: "indicador";
      readonly nome: "bollinger";
      readonly periodo: number;
      readonly desvios: number;
      readonly saida: SaidaBollinger;
    }
  | {
      readonly tipo: "indicador";
      readonly nome: "donchian";
      readonly periodo: number;
      readonly saida: SaidaDonchian;
    }
  | {
      readonly tipo: "indicador";
      readonly nome: "macd";
      readonly rapida: number;
      readonly lenta: number;
      readonly periodoSinal: number;
      readonly saida: SaidaMacd;
    }
  | {
      readonly tipo: "indicador";
      readonly nome: "estocastico";
      readonly periodo: number;
      readonly suavizacao: number;
      readonly saida: SaidaEstocastico;
    }
  | { readonly tipo: "indicador"; readonly nome: "adx"; readonly periodo: number; readonly saida: SaidaAdx }
  | { readonly tipo: "indicador"; readonly nome: "vwap" }
  | {
      readonly tipo: "indicador";
      readonly nome: "faixaAbertura";
      /** Minutos desde o primeiro candle do dia. */
      readonly periodo: number;
      readonly saida: SaidaFaixaAbertura;
    };

export type Indicador = OperandoIndicador["nome"];
export type GrupoIndicador = "tendencia" | "momento" | "volatilidade" | "volume" | "sessao";
export type ParametroIndicador = "periodo" | "desvios" | "rapida" | "lenta" | "periodoSinal" | "suavizacao";

export interface DefinicaoIndicador {
  readonly titulo: string;
  readonly grupo: GrupoIndicador;
  /** Uma frase sobre o que o indicador mede, para a dica da tela. */
  readonly descricao: string;
  readonly parametros: readonly { readonly campo: ParametroIndicador; readonly rotulo: string }[];
  /** Vazio quando o indicador tem uma saída só. */
  readonly saidas: readonly { readonly valor: string; readonly rotulo: string }[];
  readonly padrao: OperandoIndicador;
}

export const PERIODO_MAXIMO = 500;
export const DESVIOS_MAXIMOS = 10;
export const SUAVIZACAO_MAXIMA = 50;

const PERIODO = { campo: "periodo", rotulo: "período" } as const;

export const INDICADORES: Readonly<Record<Indicador, DefinicaoIndicador>> = {
  sma: {
    titulo: "Média móvel simples (SMA)",
    grupo: "tendencia",
    descricao: "média dos últimos N fechamentos",
    parametros: [PERIODO],
    saidas: [],
    padrao: { tipo: "indicador", nome: "sma", periodo: 20 },
  },
  ema: {
    titulo: "Média móvel exponencial (EMA)",
    grupo: "tendencia",
    descricao: "média que pesa mais os fechamentos recentes",
    parametros: [PERIODO],
    saidas: [],
    padrao: { tipo: "indicador", nome: "ema", periodo: 20 },
  },
  macd: {
    titulo: "MACD",
    grupo: "tendencia",
    descricao: "diferença entre duas EMAs e a média dessa diferença (sinal)",
    parametros: [
      { campo: "rapida", rotulo: "média rápida" },
      { campo: "lenta", rotulo: "média lenta" },
      { campo: "periodoSinal", rotulo: "média do sinal" },
    ],
    saidas: [
      { valor: "macd", rotulo: "linha do MACD" },
      { valor: "sinal", rotulo: "linha de sinal" },
      { valor: "histograma", rotulo: "histograma" },
    ],
    padrao: { tipo: "indicador", nome: "macd", rapida: 12, lenta: 26, periodoSinal: 9, saida: "macd" },
  },
  adx: {
    titulo: "ADX (força da tendência)",
    grupo: "tendencia",
    descricao: "força da tendência de 0 a 100, sem dizer a direção; +DI e −DI dizem a direção",
    parametros: [PERIODO],
    saidas: [
      { valor: "adx", rotulo: "ADX" },
      { valor: "maisDI", rotulo: "+DI (força das altas)" },
      { valor: "menosDI", rotulo: "−DI (força das quedas)" },
    ],
    padrao: { tipo: "indicador", nome: "adx", periodo: 14, saida: "adx" },
  },
  rsi: {
    titulo: "Índice de força relativa (RSI)",
    grupo: "momento",
    descricao: "de 0 a 100: abaixo de 30 costuma ser chamado de sobrevendido, acima de 70 de sobrecomprado",
    parametros: [PERIODO],
    saidas: [],
    padrao: { tipo: "indicador", nome: "rsi", periodo: 14 },
  },
  estocastico: {
    titulo: "Estocástico",
    grupo: "momento",
    descricao: "onde o fechamento está na faixa dos últimos N candles, de 0 a 100",
    parametros: [PERIODO, { campo: "suavizacao", rotulo: "suavização do %D" }],
    saidas: [
      { valor: "k", rotulo: "%K" },
      { valor: "d", rotulo: "%D (média do %K)" },
    ],
    padrao: { tipo: "indicador", nome: "estocastico", periodo: 14, suavizacao: 3, saida: "k" },
  },
  roc: {
    titulo: "Taxa de variação (ROC)",
    grupo: "momento",
    descricao: "quanto o preço variou, em %, contra N candles atrás",
    parametros: [PERIODO],
    saidas: [],
    padrao: { tipo: "indicador", nome: "roc", periodo: 10 },
  },
  momento: {
    titulo: "Momento",
    grupo: "momento",
    descricao: "quanto o preço variou, em preço, contra N candles atrás",
    parametros: [PERIODO],
    saidas: [],
    padrao: { tipo: "indicador", nome: "momento", periodo: 10 },
  },
  atr: {
    titulo: "ATR (amplitude média)",
    grupo: "volatilidade",
    descricao: "quanto o preço costuma andar por candle, em preço (Wilder)",
    parametros: [PERIODO],
    saidas: [],
    padrao: { tipo: "indicador", nome: "atr", periodo: 14 },
  },
  bollinger: {
    titulo: "Bandas de Bollinger",
    grupo: "volatilidade",
    descricao: "média de N com bandas a k desvios-padrão acima e abaixo",
    parametros: [PERIODO, { campo: "desvios", rotulo: "desvios-padrão" }],
    saidas: [
      { valor: "inferior", rotulo: "banda inferior" },
      { valor: "media", rotulo: "média (meio)" },
      { valor: "superior", rotulo: "banda superior" },
      { valor: "percentualB", rotulo: "%B (0 = inferior, 1 = superior)" },
      { valor: "largura", rotulo: "largura relativa" },
    ],
    padrao: { tipo: "indicador", nome: "bollinger", periodo: 20, desvios: 2, saida: "inferior" },
  },
  donchian: {
    titulo: "Canal de Donchian",
    grupo: "volatilidade",
    descricao: "maior máxima e menor mínima dos N candles anteriores (sem o atual)",
    parametros: [PERIODO],
    saidas: [
      { valor: "superior", rotulo: "topo (maior máxima)" },
      { valor: "inferior", rotulo: "fundo (menor mínima)" },
      { valor: "meio", rotulo: "meio" },
    ],
    padrao: { tipo: "indicador", nome: "donchian", periodo: 20, saida: "superior" },
  },
  volumeMedio: {
    titulo: "Volume médio",
    grupo: "volume",
    descricao: "média dos últimos N volumes",
    parametros: [PERIODO],
    saidas: [],
    padrao: { tipo: "indicador", nome: "volumeMedio", periodo: 20 },
  },
  volumeRelativo: {
    titulo: "Volume relativo",
    grupo: "volume",
    descricao: "volume do último candle dividido pela média dos N anteriores (1,5 = 50% acima)",
    parametros: [PERIODO],
    saidas: [],
    padrao: { tipo: "indicador", nome: "volumeRelativo", periodo: 20 },
  },
  vwap: {
    titulo: "VWAP do dia",
    grupo: "sessao",
    descricao:
      "preço médio do dia ponderado pelo volume, desde o primeiro candle do pregão; sem volume (como no índice à vista), não há valor",
    parametros: [],
    saidas: [],
    padrao: { tipo: "indicador", nome: "vwap" },
  },
  faixaAbertura: {
    titulo: "Faixa de abertura",
    grupo: "sessao",
    descricao:
      "maior máxima e menor mínima dos primeiros N minutos do pregão; só existe depois que eles passam",
    parametros: [{ campo: "periodo", rotulo: "minutos" }],
    saidas: [
      { valor: "superior", rotulo: "topo da faixa" },
      { valor: "inferior", rotulo: "fundo da faixa" },
      { valor: "meio", rotulo: "meio da faixa" },
    ],
    padrao: { tipo: "indicador", nome: "faixaAbertura", periodo: 30, saida: "superior" },
  },
};

/** Parâmetros em texto: vírgula entre eles, ou ponto e vírgula se algum tiver casa decimal. */
function parametros(...valores: number[]): string {
  const textos = valores.map((v) => formatarNumero(v));
  return textos.join(textos.some((t) => t.includes(",")) ? "; " : ", ");
}

const SIGLA: Readonly<Record<IndicadorSimples, string>> = {
  sma: "SMA",
  ema: "EMA",
  rsi: "RSI",
  atr: "ATR",
  roc: "ROC",
  momento: "momento",
  volumeMedio: "volume médio",
  volumeRelativo: "volume relativo",
};

const ROTULO_BOLLINGER: Readonly<Record<SaidaBollinger, string>> = {
  media: "média de Bollinger",
  superior: "banda superior de Bollinger",
  inferior: "banda inferior de Bollinger",
  percentualB: "%B de Bollinger",
  largura: "largura de Bollinger",
};
const ROTULO_DONCHIAN: Readonly<Record<SaidaDonchian, string>> = {
  superior: "topo de Donchian",
  inferior: "fundo de Donchian",
  meio: "meio de Donchian",
};
const ROTULO_MACD: Readonly<Record<SaidaMacd, string>> = {
  macd: "MACD",
  sinal: "sinal do MACD",
  histograma: "histograma do MACD",
};
const ROTULO_ADX: Readonly<Record<SaidaAdx, string>> = { adx: "ADX", maisDI: "+DI", menosDI: "−DI" };
const ROTULO_FAIXA: Readonly<Record<SaidaFaixaAbertura, string>> = {
  superior: "topo da faixa de abertura",
  inferior: "fundo da faixa de abertura",
  meio: "meio da faixa de abertura",
};

/** O nome que aparece nas explicações: "banda inferior de Bollinger(20, 2)". */
export function rotuloIndicador(op: OperandoIndicador): string {
  switch (op.nome) {
    case "bollinger":
      return `${ROTULO_BOLLINGER[op.saida]}(${parametros(op.periodo, op.desvios)})`;
    case "donchian":
      return `${ROTULO_DONCHIAN[op.saida]}(${parametros(op.periodo)})`;
    case "macd":
      return `${ROTULO_MACD[op.saida]}(${parametros(op.rapida, op.lenta, op.periodoSinal)})`;
    case "estocastico":
      return `%${op.saida.toUpperCase()} estocástico(${parametros(op.periodo, op.suavizacao)})`;
    case "adx":
      return `${ROTULO_ADX[op.saida]}(${parametros(op.periodo)})`;
    case "vwap":
      return "VWAP do dia";
    case "faixaAbertura":
      return `${ROTULO_FAIXA[op.saida]}(${parametros(op.periodo)} min)`;
    default:
      return `${SIGLA[op.nome]}(${parametros(op.periodo)})`;
  }
}

/** Valor do indicador `deslocamento` candles atrás, ou `null` sem dados suficientes. */
export function valorIndicador(
  op: OperandoIndicador,
  ctx: ContextoMercado,
  deslocamento: number,
): number | null {
  const f = ctx.fechamentos;
  switch (op.nome) {
    case "sma":
      return sma(f, op.periodo, deslocamento);
    case "ema":
      return ema(f, op.periodo, deslocamento);
    case "rsi":
      return rsi(f, op.periodo, deslocamento);
    case "roc":
      return roc(f, op.periodo, deslocamento);
    case "momento":
      return momento(f, op.periodo, deslocamento);
    case "volumeMedio":
    case "volumeRelativo": {
      const v = serieDe(ctx, "volumes");
      if (!v) return null;
      return (op.nome === "volumeMedio" ? volumeMedio : volumeRelativo)(v, op.periodo, deslocamento);
    }
    case "atr": {
      const v = hlcDe(ctx);
      return v && atr(v, op.periodo, deslocamento);
    }
    case "bollinger":
      return bollinger(f, op.periodo, op.desvios, deslocamento)?.[op.saida] ?? null;
    case "donchian": {
      const v = hlcDe(ctx);
      return (v && donchian(v, op.periodo, deslocamento)?.[op.saida]) ?? null;
    }
    case "macd":
      return macd(f, op.rapida, op.lenta, op.periodoSinal, deslocamento)?.[op.saida] ?? null;
    case "estocastico": {
      const v = hlcDe(ctx);
      return (v && estocastico(v, op.periodo, op.suavizacao, deslocamento)?.[op.saida]) ?? null;
    }
    case "adx": {
      const v = hlcDe(ctx);
      return (v && adx(v, op.periodo, deslocamento)?.[op.saida]) ?? null;
    }
    case "vwap":
      return vwapDoDia(ctx, deslocamento);
    case "faixaAbertura":
      return faixaDeAbertura(ctx, op.periodo, deslocamento)?.[op.saida] ?? null;
  }
}

const inteiroEntre = (v: unknown, min: number, max: number): boolean =>
  Number.isInteger(v) && (v as number) >= min && (v as number) <= max;

/** O que está errado no operando, em frases para a pessoa (vazio = válido). */
export function problemasIndicador(op: OperandoIndicador): string[] {
  const definicao = (INDICADORES as Partial<Record<string, DefinicaoIndicador>>)[op.nome];
  if (!definicao) return [`indicador desconhecido: ${String(op.nome)}`];
  const problemas: string[] = [];
  const nome = nomeIndicador(op.nome);
  if (definicao.saidas.length && !definicao.saidas.some((s) => s.valor === (op as { saida?: string }).saida))
    problemas.push(`escolha qual linha de ${nome} comparar`);
  if (op.nome === "macd") {
    const ok = [op.rapida, op.lenta, op.periodoSinal].every((p) => inteiroEntre(p, 1, PERIODO_MAXIMO));
    if (!ok || op.rapida >= op.lenta)
      problemas.push(
        `os períodos do MACD precisam ser inteiros entre 1 e ${PERIODO_MAXIMO}, com a média rápida menor que a lenta`,
      );
    return problemas;
  }
  if (op.nome === "vwap") return problemas;
  if (!inteiroEntre(op.periodo, 1, PERIODO_MAXIMO))
    problemas.push(`o período de ${nome} precisa ser inteiro entre 1 e ${PERIODO_MAXIMO}`);
  if (
    op.nome === "bollinger" &&
    !(Number.isFinite(op.desvios) && op.desvios > 0 && op.desvios <= DESVIOS_MAXIMOS)
  )
    problemas.push(`os desvios de Bollinger precisam ser maiores que 0 e no máximo ${DESVIOS_MAXIMOS}`);
  if (op.nome === "estocastico" && !inteiroEntre(op.suavizacao, 1, SUAVIZACAO_MAXIMA))
    problemas.push(`a suavização do estocástico precisa ser inteira entre 1 e ${SUAVIZACAO_MAXIMA}`);
  return problemas;
}

/** Nome curto do indicador, sem parâmetros: "Bollinger", "RSI", "volume relativo". */
export function nomeIndicador(nome: Indicador): string {
  switch (nome) {
    case "bollinger":
      return "Bollinger";
    case "donchian":
      return "Donchian";
    case "macd":
      return "MACD";
    case "estocastico":
      return "estocástico";
    case "adx":
      return "ADX";
    case "vwap":
      return "VWAP";
    case "faixaAbertura":
      return "faixa de abertura";
    default:
      return SIGLA[nome];
  }
}
