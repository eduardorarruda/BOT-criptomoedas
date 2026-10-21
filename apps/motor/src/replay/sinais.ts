import {
  contextoDeCandles,
  decidir,
  dec,
  POSICAO_ZERADA,
  simularDesfecho,
  type Candle,
  type ContextoMercado,
  type Desfecho,
  type Estrategia,
  type Sinal,
  type Valor,
} from "@zentrade/dominio";

export type SinalDeCompra = Extract<Sinal, { acao: "COMPRAR" }>;

export interface ParametrosSinais {
  readonly simbolo: string;
  /** Candles fechados em ordem, com aquecimento antes de `inicio` e os depois de `fim` (só para o desfecho). */
  readonly candles: readonly Candle[];
  readonly estrategia: Estrategia;
  /** Só sinais de candles que abrem a partir daqui (ms). */
  readonly inicio: number;
  /** E que fecham antes daqui (ms, exclusivo). */
  readonly fim: number;
  readonly nocionalUsd: number;
  readonly horizonte: number;
  readonly janela: number;
  readonly bpsContra: number;
}

export interface SinalReplay {
  readonly simbolo: string;
  /** Posição do candle do sinal em `candles`. */
  readonly indice: number;
  /** O instante da decisão: logo depois do fechamento do candle do sinal (= abertura do próximo). */
  readonly ate: number;
  /** Fechamento do candle do sinal: o preço que o robô ao vivo veria. */
  readonly preco: Valor;
  readonly sinal: SinalDeCompra;
  /** O que a regra pura teria dado entrando na abertura do candle seguinte, com os custos do backtest. */
  readonly desfecho: Desfecho;
}

/** Os últimos `n` candles até o `i` (inclusive), como o robô os veria no fechamento de `i`. */
function janelaAte(todos: ContextoMercado, i: number, n: number): ContextoMercado {
  const de = Math.max(0, i + 1 - n);
  const fatia = (s: readonly number[] | undefined) => s?.slice(de, i + 1);
  const series = (["aberturas", "maximas", "minimas", "volumes", "instantes"] as const).flatMap((nome) => {
    const s = fatia(todos[nome]);
    return s ? [[nome, s] as const] : [];
  });
  return {
    fechamentos: todos.fechamentos.slice(de, i + 1),
    ...Object.fromEntries(series),
    ...(todos.intervaloMs !== undefined ? { intervaloMs: todos.intervaloMs } : {}),
  };
}

/**
 * Os sinais de entrada da estratégia, um de cada vez por símbolo (a regra pura só tem
 * uma posição aberta): em cada candle fechado, a regra olha só os candles até ele; se
 * mandar comprar, a entrada é na ABERTURA do candle seguinte e o desfecho sai da mesma
 * simulação do placar (stop, regra de saída, tempo, horizonte). Enquanto a posição da
 * regra pura estiver aberta, não há sinal novo. Se a posição ainda está aberta no fim dos
 * dados, o último sinal fica com desfecho pendente e a varredura para.
 */
export function gerarSinais(p: ParametrosSinais): SinalReplay[] {
  const todos = contextoDeCandles(p.candles);
  const sinais: SinalReplay[] = [];
  let i = p.candles.findIndex((c) => c.abertura >= p.inicio);
  if (i < 0) return sinais;
  while (i < p.candles.length - 1) {
    const vela = p.candles[i] as Candle;
    const proxima = p.candles[i + 1] as Candle;
    if (vela.fechamento + 1 >= p.fim) break;
    const ctx = janelaAte(todos, i, p.janela);
    const s = decidir(p.estrategia, { ...ctx, preco: vela.fecha }, POSICAO_ZERADA);
    if (s.acao !== "COMPRAR") {
      i++;
      continue;
    }
    const desfecho = simularDesfecho({
      estrategia: p.estrategia,
      sentido: "comprado",
      preco: proxima.abre,
      quantidade: dec(p.nocionalUsd).div(proxima.abre),
      custos: { mercado: "cripto", taxaPorLado: p.estrategia.taxa, bpsContra: p.bpsContra },
      antes: p.candles.slice(Math.max(0, i + 1 - p.janela), i + 1),
      depois: p.candles.slice(i + 1, i + 1 + p.horizonte),
      horizonte: p.horizonte,
    });
    sinais.push({
      simbolo: p.simbolo,
      indice: i,
      ate: vela.fechamento + 1,
      preco: vela.fecha,
      sinal: s,
      desfecho,
    });
    if (desfecho.situacao === "pendente") break;
    const saida = p.candles.findIndex((c) => c.fechamento === desfecho.em);
    i = Math.max(i + 1, saida);
  }
  return sinais;
}
