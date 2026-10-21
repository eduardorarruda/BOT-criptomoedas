import type { Estrategia } from "./estrategia.js";
import type { Mercado } from "./mercados/mercado.js";
import type { Operando, Regra } from "./regras.js";

/**
 * Modelos de estratégia: EXEMPLOS conhecidos da literatura de análise técnica,
 * para começar a montar e a testar (backtest, papel, modo observar). As famílias
 * escolhidas — tendência/momento e rompimento — são as que têm a evidência menos
 * fraca em cripto, e mesmo assim frágil. Nenhum modelo é recomendação.
 *
 * Os modelos do mini índice (WIN) são adaptações para day trade em candles de 5
 * minutos, nos dois sentidos. A taxa deles é zero porque, no WIN, os custos (tarifa
 * da B3, corretagem e deslizamento em ticks) vêm do modelo do mercado no backtest;
 * os percentuais de stop e alvo são sobre o índice (1% de 200.000 = 2.000 pontos).
 */
export interface ModeloEstrategia {
  readonly id: string;
  readonly nome: string;
  /** Um parágrafo: a ideia, onde tende a funcionar e onde tende a falhar. */
  readonly descricao: string;
  readonly estrategia: Estrategia;
  /** Para que mercado o modelo foi pensado. Sem ele, cripto. */
  readonly mercado?: Mercado;
  /** O intervalo de candles para o qual os parâmetros foram pensados. */
  readonly intervalo?: "5m" | "15m" | "1h";
}

export const AVISO_MODELOS =
  "Exemplo educativo, para estudar e testar no backtest e no papel. Não é recomendação de investimento nem promessa de resultado: desempenho passado, inclusive o de estudos publicados, não garante desempenho futuro.";

const preco: Operando = { tipo: "preco" };
const numero = (valor: number): Operando => ({ tipo: "numero", valor });
const comparar = (
  esquerda: Operando,
  comparador: "<" | ">" | "cruzouAcima" | "cruzouAbaixo",
  direita: Operando,
): Regra => ({
  tipo: "comparar",
  esquerda,
  comparador,
  direita,
});
const TAXA_BINANCE = 0.001;

export const MODELOS: readonly ModeloEstrategia[] = [
  {
    id: "donchian-20-10",
    nome: "Rompimento de Donchian 20/10",
    descricao:
      "Compra quando o fechamento passa da maior máxima dos 20 candles anteriores e sai quando fecha abaixo da menor mínima dos 10 anteriores — a regra dos “Turtle Traders” dos anos 1980: deixar a tendência correr e cortar cedo o que não andou. O stop fica a 2 ATR da entrada e o tamanho da posição sai do mesmo ATR, então cada operação arrisca parecido com o mercado calmo ou agitado. Tende a funcionar em tendências longas e fortes; sofre em mercado lateral, com rompimentos falsos em sequência (muitas perdas pequenas antes de um ganho grande). O alvo fica longe de propósito: quem encerra é a regra de saída ou o stop.",
    estrategia: {
      entrada: comparar(preco, ">", { tipo: "indicador", nome: "donchian", periodo: 20, saida: "superior" }),
      saida: comparar(preco, "<", { tipo: "indicador", nome: "donchian", periodo: 10, saida: "inferior" }),
      stop: 0.1,
      stopAtr: { periodo: 20, multiplo: 2 },
      tamanhoPorVolatilidade: { periodo: 20, multiplo: 2 },
      alvoLiquido: 0.6,
      taxa: TAXA_BINANCE,
    },
  },
  {
    id: "ema-9-21-adx",
    nome: "Tendência EMA 9/21 com ADX e volume",
    descricao:
      "Compra quando a EMA de 9 cruza para cima a de 21, mas só se o ADX(14) mostrar tendência com alguma força (acima de 20) e o volume do candle vier 20% acima da média — dois filtros para evitar cruzamentos no meio do nada. Vende no cruzamento contrário, e um stop móvel a 3 ATR da maior máxima protege o ganho no caminho. Tende a funcionar quando o mercado engata uma direção com participação; falha em lateralidade agitada, quando as médias se cruzam várias vezes, e sempre entra e sai com atraso, porque médias olham para trás.",
    estrategia: {
      entrada: {
        tipo: "e",
        regras: [
          comparar({ tipo: "indicador", nome: "ema", periodo: 9 }, "cruzouAcima", {
            tipo: "indicador",
            nome: "ema",
            periodo: 21,
          }),
          comparar({ tipo: "indicador", nome: "adx", periodo: 14, saida: "adx" }, ">", numero(20)),
          comparar({ tipo: "indicador", nome: "volumeRelativo", periodo: 20 }, ">", numero(1.2)),
        ],
      },
      saida: comparar({ tipo: "indicador", nome: "ema", periodo: 9 }, "cruzouAbaixo", {
        tipo: "indicador",
        nome: "ema",
        periodo: 21,
      }),
      stop: 0.06,
      stopMovel: { tipo: "atr", periodo: 14, multiplo: 3 },
      alvoLiquido: 0.3,
      taxa: TAXA_BINANCE,
    },
  },
  {
    id: "bollinger-sma200",
    nome: "Volta à média com Bollinger e filtro SMA 200",
    descricao:
      "Compra quando o preço fecha abaixo da banda inferior de Bollinger(20, 2), mas só com o preço acima da média de 200 candles — a aposta é numa queda curta dentro de uma alta maior, não em pegar faca caindo. Sai quando o preço volta à média das bandas, ou depois de 20 candles sem resolver. Tende a funcionar em mercado de alta com correções rasas; falha quando a queda vira tendência (a banda inferior desce junto e o stop é quem encerra) e em quedas rápidas que atravessam a SMA 200 de uma vez.",
    estrategia: {
      entrada: {
        tipo: "e",
        regras: [
          comparar(preco, "<", {
            tipo: "indicador",
            nome: "bollinger",
            periodo: 20,
            desvios: 2,
            saida: "inferior",
          }),
          comparar(preco, ">", { tipo: "indicador", nome: "sma", periodo: 200 }),
        ],
      },
      saida: comparar(preco, ">", {
        tipo: "indicador",
        nome: "bollinger",
        periodo: 20,
        desvios: 2,
        saida: "media",
      }),
      stop: 0.05,
      tempoMaximo: 20,
      alvoLiquido: 0.06,
      taxa: TAXA_BINANCE,
    },
  },
  {
    id: "macd-momento",
    nome: "Momento com MACD",
    descricao:
      "Compra quando a linha do MACD(12, 26, 9) cruza para cima a linha de sinal com o preço acima da EMA de 50 — momento a favor de uma tendência que já existe. Sai quando o histograma volta a ficar negativo. O stop inicial fica a 2 ATR, e depois de +3% ele vai para o empate (as duas taxas pagas). Tende a funcionar em altas com fôlego e correções curtas; falha em mercado de lado, onde MACD e sinal se cruzam o tempo todo, e devolve parte do ganho porque o sinal de saída também chega atrasado.",
    estrategia: {
      entrada: {
        tipo: "e",
        regras: [
          comparar(
            { tipo: "indicador", nome: "macd", rapida: 12, lenta: 26, periodoSinal: 9, saida: "macd" },
            "cruzouAcima",
            { tipo: "indicador", nome: "macd", rapida: 12, lenta: 26, periodoSinal: 9, saida: "sinal" },
          ),
          comparar(preco, ">", { tipo: "indicador", nome: "ema", periodo: 50 }),
        ],
      },
      saida: comparar(
        { tipo: "indicador", nome: "macd", rapida: 12, lenta: 26, periodoSinal: 9, saida: "histograma" },
        "<",
        numero(0),
      ),
      stop: 0.08,
      stopAtr: { periodo: 14, multiplo: 2 },
      empate: { gatilho: 0.03 },
      alvoLiquido: 0.2,
      taxa: TAXA_BINANCE,
    },
  },
  {
    id: "rsi2-tendencia",
    nome: "RSI(2) em tendência de alta",
    descricao:
      "Compra quando o RSI de apenas 2 candles cai abaixo de 10 com o preço acima da média de 200 — a ideia popularizada por Larry Connors: num mercado em alta, dois ou três candles de queda forte costumam ser seguidos de repique. Sai quando o preço fecha acima da média de 5 ou depois de 10 candles. Tende a funcionar em altas firmes e mercados que voltam à média no curto prazo; falha quando a queda continua (o RSI fica baixo por vários candles e o stop é atingido) e é sensível às taxas, porque os ganhos por operação são pequenos.",
    estrategia: {
      entrada: {
        tipo: "e",
        regras: [
          comparar({ tipo: "indicador", nome: "rsi", periodo: 2 }, "<", numero(10)),
          comparar(preco, ">", { tipo: "indicador", nome: "sma", periodo: 200 }),
        ],
      },
      saida: comparar(preco, ">", { tipo: "indicador", nome: "sma", periodo: 5 }),
      stop: 0.06,
      tempoMaximo: 10,
      alvoLiquido: 0.08,
      taxa: TAXA_BINANCE,
    },
  },
];

/* ---------- Mini índice (WIN), day trade em 5 minutos, nos dois sentidos ---------- */

const ema = (periodo: number): Operando => ({ tipo: "indicador", nome: "ema", periodo });
const adx14: Operando = { tipo: "indicador", nome: "adx", periodo: 14, saida: "adx" };
const faixa = (saida: "superior" | "inferior" | "meio"): Operando => ({
  tipo: "indicador",
  nome: "faixaAbertura",
  periodo: 30,
  saida,
});
const bollinger = (saida: "superior" | "inferior" | "media"): Operando => ({
  tipo: "indicador",
  nome: "bollinger",
  periodo: 20,
  desvios: 2,
  saida,
});
const donchian = (periodo: number, saida: "superior" | "inferior"): Operando => ({
  tipo: "indicador",
  nome: "donchian",
  periodo,
  saida,
});
/** No WIN, os custos vêm do modelo do mercado (tarifa B3, corretagem, ticks). */
const SEM_TAXA = 0;

export const MODELOS_WIN: readonly ModeloEstrategia[] = [
  {
    id: "win-faixa-abertura-30",
    nome: "Mini índice: rompimento da faixa de abertura (30 min)",
    mercado: "win",
    intervalo: "5m",
    descricao:
      "Marca a maior máxima e a menor mínima dos primeiros 30 minutos do pregão e opera o rompimento: compra quando o preço fecha acima do topo da faixa e vende quando fecha abaixo do fundo. Sai se o preço voltar ao meio da faixa, no stop (4 ATR, no máximo 1% do índice, para ficar além do meio da faixa — se o stop ficasse antes do meio, a saída pelo meio nunca agiria) ou na zeragem do fim do dia. A ideia, estudada desde os anos 1990 em futuros de índice, é que o começo do pregão concentra a informação da noite e o rompimento da faixa pode marcar a direção do dia. Tende a funcionar em dias de tendência; sofre em dias laterais, com rompimentos falsos para os dois lados, e é sensível ao deslizamento logo depois da abertura.",
    estrategia: {
      direcao: "ambos",
      entrada: comparar(preco, "cruzouAcima", faixa("superior")),
      entradaVendida: comparar(preco, "cruzouAbaixo", faixa("inferior")),
      saida: comparar(preco, "<", faixa("meio")),
      saidaVendida: comparar(preco, ">", faixa("meio")),
      stop: 0.01,
      stopAtr: { periodo: 14, multiplo: 4 },
      alvoLiquido: 0.01,
      taxa: SEM_TAXA,
    },
  },
  {
    id: "win-ema-9-21-adx",
    nome: "Mini índice: tendência EMA 9/21 com ADX",
    mercado: "win",
    intervalo: "5m",
    descricao:
      "Compra quando a EMA de 9 cruza para cima a de 21 e vende quando cruza para baixo, nos dois casos só se o ADX(14) estiver acima de 20 (alguma força de tendência). O stop começa a 2 ATR (no máximo 0,3%) e vira um stop móvel a 3 ATR do melhor preço desde a entrada; sai no cruzamento contrário ou na zeragem do fim do dia. É a versão de day trade da tendência por médias: tende a funcionar em pregões que engatam uma direção; em pregões de lado, as médias se cruzam várias vezes e cada entrada paga tarifa e deslizamento. Como as médias olham para trás, entra e sai com atraso.",
    estrategia: {
      direcao: "ambos",
      entrada: {
        tipo: "e",
        regras: [comparar(ema(9), "cruzouAcima", ema(21)), comparar(adx14, ">", numero(20))],
      },
      entradaVendida: {
        tipo: "e",
        regras: [comparar(ema(9), "cruzouAbaixo", ema(21)), comparar(adx14, ">", numero(20))],
      },
      saida: comparar(ema(9), "cruzouAbaixo", ema(21)),
      saidaVendida: comparar(ema(9), "cruzouAcima", ema(21)),
      stop: 0.003,
      stopAtr: { periodo: 14, multiplo: 2 },
      stopMovel: { tipo: "atr", periodo: 14, multiplo: 3 },
      alvoLiquido: 0.012,
      taxa: SEM_TAXA,
    },
  },
  {
    id: "win-bollinger-volta-media",
    nome: "Mini índice: volta à média com Bollinger no pregão",
    mercado: "win",
    intervalo: "5m",
    descricao:
      "Aposta que, sem tendência forte, os exageros do pregão voltam para a média: compra quando o preço fecha abaixo da banda inferior de Bollinger(20, 2) e vende quando fecha acima da superior, só com o ADX(14) abaixo de 20. Sai quando o preço volta à média das bandas, depois de 12 candles (1 hora) sem resolver, no stop (1,5 ATR, no máximo 0,25%) ou na zeragem. Tende a funcionar em pregões laterais; falha quando o movimento vira tendência (a banda anda junto e o stop encerra) e em dias de notícia. Os ganhos por operação são pequenos, então os custos pesam muito.",
    estrategia: {
      direcao: "ambos",
      entrada: {
        tipo: "e",
        regras: [comparar(preco, "<", bollinger("inferior")), comparar(adx14, "<", numero(20))],
      },
      entradaVendida: {
        tipo: "e",
        regras: [comparar(preco, ">", bollinger("superior")), comparar(adx14, "<", numero(20))],
      },
      saida: comparar(preco, ">", bollinger("media")),
      saidaVendida: comparar(preco, "<", bollinger("media")),
      stop: 0.0025,
      stopAtr: { periodo: 14, multiplo: 1.5 },
      tempoMaximo: 12,
      alvoLiquido: 0.006,
      taxa: SEM_TAXA,
    },
  },
  {
    id: "win-donchian-atr",
    nome: "Mini índice: rompimento de Donchian 20/10 com stop por ATR",
    mercado: "win",
    intervalo: "5m",
    descricao:
      "A regra dos Turtle Traders encolhida para o dia: compra quando o preço fecha acima da maior máxima dos 20 candles anteriores e vende quando fecha abaixo da menor mínima deles. A compra sai quando o preço fecha abaixo da menor mínima dos 10 anteriores (e a venda, acima da maior máxima dos 10), com stop a 2 ATR (no máximo 0,3%) e zeragem no fim do dia. Tende a funcionar em pregões com tendência longa; em pregões laterais, rompimentos falsos se repetem e cada um paga custo. Em 5 minutos, 20 candles são só 100 minutos de história.",
    estrategia: {
      direcao: "ambos",
      entrada: comparar(preco, ">", donchian(20, "superior")),
      entradaVendida: comparar(preco, "<", donchian(20, "inferior")),
      saida: comparar(preco, "<", donchian(10, "inferior")),
      saidaVendida: comparar(preco, ">", donchian(10, "superior")),
      stop: 0.003,
      stopAtr: { periodo: 14, multiplo: 2 },
      alvoLiquido: 0.015,
      taxa: SEM_TAXA,
    },
  },
  {
    id: "win-p1-tendencia-horario",
    nome: "Mini índice: rompimento a favor da tendência, fora da abertura e do almoço",
    mercado: "win",
    intervalo: "5m",
    descricao:
      "Compra quando o preço passa da maior máxima dos 20 candles anteriores e está acima da média de 200 candles, e sai quando fecha abaixo da menor mínima dos 10 anteriores (ou no stop, ou na zeragem do fim do dia). Não abre operação na primeira hora do pregão (9h–10h) nem no almoço (12h–14h), horários de muito ruído e pouca direção. É a versão para o mini índice do rompimento com filtro de tendência que se sustentou nos testes do ZenTrade em cripto (15 moedas, 2021–2026) e nos 20 pregões da B3 de 21/09 a 19/10/2026 — amostra ainda pequena. Só compra: no período testado, a versão espelhada (vendendo nos rompimentos para baixo) perdeu. Tende a funcionar em dias de tendência e de evento (é neles que estão os ganhos grandes); sofre em dias laterais, com rompimentos falsos.",
    estrategia: {
      entrada: {
        tipo: "e",
        regras: [
          comparar(preco, ">", donchian(20, "superior")),
          comparar(preco, ">", { tipo: "indicador", nome: "sma", periodo: 200 }),
          { tipo: "nao", regra: { tipo: "horario", de: "09:00", ate: "10:00" } },
          { tipo: "nao", regra: { tipo: "horario", de: "12:00", ate: "14:00" } },
        ],
      },
      saida: comparar(preco, "<", donchian(10, "inferior")),
      stop: 0.1,
      stopAtr: { periodo: 20, multiplo: 2 },
      alvoLiquido: 0.6,
      taxa: SEM_TAXA,
    },
  },
];

/** Todos os modelos: os de cripto e os do mini índice. */
export const TODOS_OS_MODELOS: readonly ModeloEstrategia[] = [...MODELOS, ...MODELOS_WIN];
