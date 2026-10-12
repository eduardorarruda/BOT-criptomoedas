import type { Estrategia } from "./estrategia.js";
import type { Operando, Regra } from "./regras.js";

/**
 * Modelos de estratégia: EXEMPLOS conhecidos da literatura de análise técnica,
 * para começar a montar e a testar (backtest, papel, modo observar). As famílias
 * escolhidas — tendência/momento e rompimento — são as que têm a evidência menos
 * fraca em cripto, e mesmo assim frágil. Nenhum modelo é recomendação.
 */
export interface ModeloEstrategia {
  readonly id: string;
  readonly nome: string;
  /** Um parágrafo: a ideia, onde tende a funcionar e onde tende a falhar. */
  readonly descricao: string;
  readonly estrategia: Estrategia;
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
