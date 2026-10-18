import { contextoDeCandles, type ContextoMercado } from "../contexto.js";
import { dec, type Valor } from "../dinheiro.js";
import { decidirComSentido, precoAlvo, type Estrategia, type MotivoVenda } from "../estrategia.js";
import { saidaNoCandle, type NiveisSaida } from "../intrabar.js";
import { deveZerar, diaB3, fimDoCandle, type SessaoB3 } from "../mercados/sessao-b3.js";
import { custoFixoPorLado, precoExecutado, reaisDosPontos, type CustosWin } from "../mercados/win.js";
import { atualizarStop, iniciarAcompanhamento, stopDeEntrada, type Acompanhamento } from "../saidas.js";
import { fatorSentido, type Sentido } from "../sentido.js";
import type { Candle, Lado } from "../tipos.js";

/**
 * O desfecho de uma decisão: o que teria acontecido se a entrada tivesse sido feita
 * no fechamento do candle do sinal. É o contrafactual do placar do Claude — o mesmo
 * para quem ele aprovou e para quem ele vetou — e segue a mesma lógica de saída do
 * backtest: a cada candle seguinte, stop e alvo DENTRO do candle (`saidaNoCandle`, pior
 * caso) e, no fechamento, stop móvel e empate (`atualizarStop`) e a decisão da
 * estratégia com a posição aberta (`decidirComSentido`: stop, alvo, regra de saída e
 * tempo máximo). No mini índice, também zera na hora da zeragem e no último candle do
 * pregão. Puro e determinístico: mesma entrada, mesmo desfecho; nada olha o futuro
 * além dos candles que já fecharam.
 */

/** Os custos do mercado em que a entrada seria feita. */
export type CustosDesfecho =
  | {
      readonly mercado: "cripto";
      /** Taxa da corretora por ponta, em fração (0,001 = 0,1%). */
      readonly taxaPorLado: number;
      /** Deslizamento mais meio spread, em pontos-base contra quem opera. */
      readonly bpsContra: number;
    }
  | {
      readonly mercado: "win";
      readonly custos: CustosWin;
      /** Com ela, a posição zera na hora da zeragem e no último candle do pregão. */
      readonly sessao?: SessaoB3;
    };

export interface PedidoDesfecho {
  readonly estrategia: Estrategia;
  readonly sentido: Sentido;
  /** O preço de referência da decisão: o fechamento do candle do sinal. */
  readonly preco: Valor;
  /** Cripto: unidades do ativo; mini índice: contratos. */
  readonly quantidade: Valor;
  readonly custos: CustosDesfecho;
  /** Candles fechados até o da decisão (inclusive), para os indicadores e o ATR. */
  readonly antes: readonly Candle[];
  /** Candles fechados depois da decisão, em ordem. */
  readonly depois: readonly Candle[];
  /** Quantos candles esperar: sem saída até lá, fecha no fechamento do último. */
  readonly horizonte: number;
  /** Stop e alvo efetivos gravados na decisão (regra ou agente); sem eles, os da estratégia. */
  readonly protecao?: NiveisSaida;
  /** Quantos candles os indicadores enxergam (o histórico do robô). Padrão: 300. */
  readonly janela?: number;
}

export type MotivoDesfecho = "stop" | "alvo" | "regra" | "tempo" | "zeragem" | "horizonte";

export interface DesfechoConcluido {
  readonly situacao: "concluido";
  readonly motivo: MotivoDesfecho;
  /** Candles depois da decisão até a saída. */
  readonly barras: number;
  /** Preços executados (com deslizamento ou tick contra). */
  readonly entrada: Valor;
  readonly saida: Valor;
  /** Resultado líquido (taxas e custos das duas pontas), na moeda do mercado. */
  readonly resultado: Valor;
  /** Resultado ÷ valor da entrada. */
  readonly retorno: number;
  /** Stop e alvo no mesmo candle: contou o stop (pior caso). */
  readonly ambiguo: boolean;
  /** Fechamento do candle da saída (ms). */
  readonly em: number;
}

export interface DesfechoPendente {
  readonly situacao: "pendente";
  readonly barras: number;
}

export type Desfecho = DesfechoConcluido | DesfechoPendente;

const JANELA_PADRAO = 300;

const MOTIVO: Readonly<Record<MotivoVenda, MotivoDesfecho>> = {
  stop: "stop",
  alvo: "alvo",
  "regra de saída": "regra",
  tempo: "tempo",
};

const ladoDeAbrir = (s: Sentido): Lado => (s === "comprado" ? "COMPRA" : "VENDA");
const ladoDeFechar = (s: Sentido): Lado => (s === "comprado" ? "VENDA" : "COMPRA");

/** Onde a ordem executa: cripto com os pontos-base contra; mini índice no tick, com ticks contra. */
function executar(c: CustosDesfecho, referencia: Valor, lado: Lado): Valor {
  if (c.mercado === "win") return precoExecutado(referencia, lado, c.custos.deslizamentoTicks);
  const f = dec(c.bpsContra).div(10_000);
  return referencia.times(lado === "COMPRA" ? dec(1).plus(f) : dec(1).minus(f));
}

/** Resultado líquido da ida e volta e o valor da entrada (para o retorno). */
function apurar(
  c: CustosDesfecho,
  sentido: Sentido,
  quantidade: Valor,
  entrada: Valor,
  saida: Valor,
): { readonly resultado: Valor; readonly nocional: Valor } {
  const variacao = saida.minus(entrada).times(fatorSentido(sentido));
  if (c.mercado === "win") {
    const contratos = quantidade.toNumber();
    return {
      resultado: reaisDosPontos(variacao, contratos).minus(custoFixoPorLado(c.custos).times(2 * contratos)),
      nocional: reaisDosPontos(entrada, contratos),
    };
  }
  const taxas = entrada.plus(saida).times(quantidade).times(c.taxaPorLado);
  return { resultado: variacao.times(quantidade).minus(taxas), nocional: entrada.times(quantidade) };
}

/** Recorte [de, ate) de um contexto já convertido. */
function recorte(ctx: ContextoMercado, de: number, ate: number): ContextoMercado {
  const series = (["aberturas", "maximas", "minimas", "volumes", "instantes"] as const).flatMap((nome) => {
    const s = ctx[nome];
    return s ? [[nome, s.slice(de, ate)] as const] : [];
  });
  return {
    fechamentos: ctx.fechamentos.slice(de, ate),
    ...Object.fromEntries(series),
    ...(ctx.intervaloMs !== undefined ? { intervaloMs: ctx.intervaloMs } : {}),
  };
}

function validar(p: PedidoDesfecho): void {
  if (!Number.isInteger(p.horizonte) || p.horizonte < 1)
    throw new RangeError("o horizonte precisa ser um número inteiro de candles, 1 ou mais");
  if (!p.quantidade.gt(0)) throw new RangeError("a quantidade precisa ser maior que zero");
  if (!p.preco.gt(0)) throw new RangeError("o preço da decisão precisa ser maior que zero");
}

interface Aberta {
  readonly entrada: Valor;
  readonly alvo: Valor;
  readonly acompanhamento: Acompanhamento;
}

function abrir(p: PedidoDesfecho, ctx: ContextoMercado): Aberta {
  const entrada = executar(p.custos, p.preco, ladoDeAbrir(p.sentido));
  const e = p.estrategia;
  const stop = p.protecao?.stop ?? stopDeEntrada(e, entrada, ctx, p.sentido).stop;
  const alvo = p.protecao?.alvo ?? precoAlvo(entrada, e.alvoLiquido, e.taxa, p.sentido);
  return {
    entrada,
    alvo,
    acompanhamento: { ...iniciarAcompanhamento(e, { precoMedio: entrada }, p.sentido), stop },
  };
}

/** No mini índice com sessão: hora da zeragem ou último candle do pregão. */
function zeraAqui(c: CustosDesfecho, vela: Candle, proxima: Candle | undefined): boolean {
  if (c.mercado !== "win" || !c.sessao) return false;
  if (deveZerar(fimDoCandle(vela), c.sessao)) return true;
  return proxima !== undefined && diaB3(proxima.abertura) !== diaB3(vela.abertura);
}

/** Simula a entrada da decisão sobre os candles seguintes até a saída, o horizonte ou o fim dos dados. */
export function simularDesfecho(p: PedidoDesfecho): Desfecho {
  validar(p);
  const todos = contextoDeCandles([...p.antes, ...p.depois]);
  const janela = p.janela ?? JANELA_PADRAO;
  const ate = (i: number) => recorte(todos, Math.max(0, i + 1 - janela), i + 1);
  const aberta = abrir(p, ate(p.antes.length - 1));
  let acompanhamento = aberta.acompanhamento;
  const concluir = (motivo: MotivoDesfecho, referencia: Valor, k: number, ambiguo = false): Desfecho => {
    const saida = executar(p.custos, referencia, ladoDeFechar(p.sentido));
    const { resultado, nocional } = apurar(p.custos, p.sentido, p.quantidade, aberta.entrada, saida);
    return {
      situacao: "concluido",
      motivo,
      barras: k + 1,
      entrada: aberta.entrada,
      saida,
      resultado,
      retorno: resultado.div(nocional).toNumber(),
      ambiguo,
      em: (p.depois[k] as Candle).fechamento,
    };
  };
  for (const [k, vela] of p.depois.entries()) {
    const dentro = saidaNoCandle(vela, { stop: acompanhamento.stop, alvo: aberta.alvo }, p.sentido);
    if (dentro) return concluir(dentro.motivo, dentro.preco, k, dentro.ambiguo);
    const ctx = ate(p.antes.length + k);
    acompanhamento = atualizarStop(p.estrategia, acompanhamento, ctx).acompanhamento;
    const sinal = decidirComSentido(
      p.estrategia,
      { ...ctx, preco: vela.fecha, acompanhamento },
      { sentido: p.sentido, precoMedio: aberta.entrada },
    );
    if (sinal.acao === "ZERAR") return concluir(MOTIVO[sinal.motivo], vela.fecha, k);
    if (zeraAqui(p.custos, vela, p.depois[k + 1])) return concluir("zeragem", vela.fecha, k);
    if (k + 1 >= p.horizonte) return concluir("horizonte", vela.fecha, k);
  }
  return { situacao: "pendente", barras: p.depois.length };
}
