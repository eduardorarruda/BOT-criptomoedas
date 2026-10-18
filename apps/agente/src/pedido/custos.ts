import type { CustosPedido } from "@zentrade/contratos";
import {
  custoIdaEVolta as custoDasTaxas,
  custoIdaEVoltaWin,
  dec,
  formatarReais,
  pontosDosReais,
  type Valor,
} from "@zentrade/dominio";
import { num, pct, preco as fmtPreco } from "./formato.js";

const BPS = 10_000;

export interface CustoIdaEVolta {
  /** Ida e volta como fração do preço (taxas + deslizamento + spread, nas duas pontas). */
  readonly fracao: number;
  /** O mesmo em unidades de preço (USDT por unidade do ativo; pontos no WIN). */
  readonly emPreco: Valor;
  readonly texto: string;
}

/**
 * Quanto custa entrar e sair, já nas duas pontas, com a taxa REAL da estratégia (não
 * uma suposição do modelo). Cripto: as taxas como o domínio conta o empate, mais
 * deslizamento e meio spread em cada execução. WIN: tarifa e corretagem por contrato
 * nos dois lados e os ticks de deslizamento por perna.
 */
export function custoIdaEVolta(custos: CustosPedido, preco: Valor): CustoIdaEVolta {
  if (custos.mercado === "cripto") {
    const taxas = custoDasTaxas(custos.taxaPorLado);
    const execucao = (2 * (custos.deslizamentoBps + custos.meioSpreadBps)) / BPS;
    const fracao = taxas + execucao;
    const emPreco = preco.times(fracao);
    return {
      fracao,
      emPreco,
      texto:
        `taxa da estratégia ${pct(custos.taxaPorLado, 3)} por lado (${pct(taxas, 3)} na ida e volta) + ` +
        `${num(custos.deslizamentoBps)} pb de deslizamento + ${num(custos.meioSpreadBps)} pb de meio spread por execução ` +
        `(${pct(execucao, 3)}) = ${pct(fracao, 3)} ≈ ${fmtPreco(emPreco.toNumber())} em preço`,
    };
  }
  const reais = custoIdaEVoltaWin({
    tarifaB3: dec(custos.tarifaPorContrato),
    corretagem: dec(custos.corretagemPorContrato),
    deslizamentoTicks: custos.deslizamentoTicks,
  });
  const pontos = pontosDosReais(reais);
  return {
    fracao: pontos.div(preco).toNumber(),
    emPreco: pontos,
    texto:
      `tarifa ${formatarReais(dec(custos.tarifaPorContrato))} + corretagem ${formatarReais(dec(custos.corretagemPorContrato))} ` +
      `por contrato em cada lado + ${custos.deslizamentoTicks} tick(s) de deslizamento por perna = ` +
      `${formatarReais(reais)} por contrato = ${num(pontos.toNumber(), 1)} pontos (${pct(pontos.div(preco).toNumber(), 3)})`,
  };
}
