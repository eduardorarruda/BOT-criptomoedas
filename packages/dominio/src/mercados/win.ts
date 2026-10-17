import { dec, type Valor } from "../dinheiro.js";
import { formatarNumero, formatarReais } from "../formatar.js";
import type { Lado } from "../tipos.js";

/**
 * O contrato do mini índice (WIN) na B3: cotado em pontos do Ibovespa, R$ 0,20 por
 * ponto por contrato, variação mínima (tick) de 5 pontos, lote de 1 contrato. Veja
 * conhecimento/semente/01-mini-indice-win.md e 03-custos-e-impostos-day-trade.md.
 *
 * Tudo em decimal exato: pontos e reais.
 */
export const VALOR_DO_PONTO_WIN = dec("0.2");
export const TICK_WIN = dec(5);
/**
 * Margem mínima de day trade que a B3 fixa para o varejo desde 2/2/2026. A corretora
 * pode exigir mais: por isso é configurável.
 */
export const MARGEM_DAY_TRADE_WIN = dec(155);

/** Pontos de um contrato em reais (negativo continua negativo). */
export const reaisDosPontos = (pontos: Valor, contratos = 1): Valor =>
  pontos.times(VALOR_DO_PONTO_WIN).times(contratos);

export const pontosDosReais = (reais: Valor, contratos = 1): Valor =>
  reais.div(VALOR_DO_PONTO_WIN).div(contratos);

/** Custos de cada contrato em CADA lado (entrada e saída). */
export interface CustosWin {
  /** Emolumentos + tarifa de registro da B3 (day trade, volume baixo: cerca de R$ 0,25). */
  readonly tarifaB3: Valor;
  /** Corretagem por contrato (muitas corretoras zeram em minicontratos). */
  readonly corretagem: Valor;
  /** Ticks contra quem opera em toda execução (a hipótese usual: 1). */
  readonly deslizamentoTicks: number;
}

export const CUSTOS_WIN_PADRAO: CustosWin = {
  tarifaB3: dec("0.25"),
  corretagem: dec(0),
  deslizamentoTicks: 1,
};

/** O preço no tick, arredondado contra quem opera: compra para cima, venda para baixo. */
export function noTick(preco: Valor, lado: Lado): Valor {
  const ticks = preco.div(TICK_WIN);
  return (lado === "COMPRA" ? ticks.ceil() : ticks.floor()).times(TICK_WIN);
}

/**
 * Onde a ordem a mercado (ou o stop que vira ordem a mercado) executa: a referência
 * no tick contra quem opera, mais `deslizamentoTicks` ticks contra.
 */
export function precoExecutado(referencia: Valor, lado: Lado, deslizamentoTicks: number): Valor {
  const desvio = TICK_WIN.times(deslizamentoTicks);
  const noPreco = noTick(referencia, lado);
  return lado === "COMPRA" ? noPreco.plus(desvio) : noPreco.minus(desvio);
}

/** Tarifa da B3 + corretagem de um contrato num lado. */
export const custoFixoPorLado = (c: CustosWin): Valor => c.tarifaB3.plus(c.corretagem);

/**
 * Ida e volta de 1 contrato em reais: tarifa e corretagem nos dois lados mais o
 * deslizamento dos dois lados (ticks × 5 pontos × R$ 0,20).
 */
export const custoIdaEVoltaWin = (c: CustosWin): Valor =>
  custoFixoPorLado(c)
    .times(2)
    .plus(reaisDosPontos(TICK_WIN.times(c.deslizamentoTicks)).times(2));

export interface PedidoDimensionamentoWin {
  /** Quanto se aceita perder na operação, em reais, se o stop for atingido. */
  readonly riscoPorOperacao: Valor;
  /** Distância da entrada até o stop, em pontos. */
  readonly distanciaPontos: Valor;
  readonly custos: CustosWin;
  readonly contratosMaximos: number;
  readonly margemPorContrato: Valor;
  /** Patrimônio agora: a margem de todos os contratos precisa caber nele. */
  readonly capital: Valor;
}

export interface DimensionamentoWin {
  readonly contratos: number;
  /** O que segurou o tamanho. */
  readonly limite: "risco" | "maximo" | "margem";
  readonly porRisco: number;
  readonly porMargem: number;
  /** Perda de 1 contrato no stop, com a ida e volta dos custos. */
  readonly perdaPorContrato: Valor;
  readonly explicacao: string;
}

const piso = (v: Valor): number => Math.max(0, v.floor().toNumber());

/**
 * Contratos = ⌊risco ÷ (distância do stop × R$ 0,20 + ida e volta por contrato)⌋,
 * limitado pelo máximo configurado e pela margem de day trade contra o capital
 * (⌊capital ÷ margem por contrato⌋). Zero quer dizer "não cabe": não opera.
 * É o roteiro da nota 04: o tamanho sai da perda no stop, não da margem.
 */
export function contratosPeloRisco(p: PedidoDimensionamentoWin): DimensionamentoWin {
  if (!p.distanciaPontos.gt(0)) throw new RangeError("a distância do stop precisa ser maior que zero");
  const perdaPorContrato = reaisDosPontos(p.distanciaPontos).plus(custoIdaEVoltaWin(p.custos));
  const porRisco = piso(p.riscoPorOperacao.div(perdaPorContrato));
  const porMargem = p.capital.gt(0) ? piso(p.capital.div(p.margemPorContrato)) : 0;
  const contratos = Math.min(porRisco, p.contratosMaximos, porMargem);
  const limite = contratos === porRisco ? "risco" : contratos === p.contratosMaximos ? "maximo" : "margem";
  const conta = `${formatarReais(p.riscoPorOperacao)} ÷ ${formatarReais(perdaPorContrato)} por contrato (${formatarNumero(p.distanciaPontos)} pontos de stop + custos)`;
  const explicacao =
    porRisco === 0
      ? `não cabe nem 1 contrato no risco: ${conta}`
      : limite === "risco"
        ? `${contratos} contrato(s): ${conta}`
        : limite === "maximo"
          ? `${contratos} contrato(s), o máximo configurado (o risco permitiria ${porRisco})`
          : `${contratos} contrato(s): a margem de ${formatarReais(p.margemPorContrato)} por contrato não deixa mais com ${formatarReais(p.capital)}`;
  return { contratos, limite, porRisco, porMargem, perdaPorContrato, explicacao };
}
