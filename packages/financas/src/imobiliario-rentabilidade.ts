import { dec, type Valor } from "@zentrade/dominio";
import { tabelaAmortizacao, type TabelaAmortizacao } from "./amortizacao.js";
import { ErroParametroFinanceiro, exigirTaxa, payback, paybackDescontado, tir, vpl } from "./fluxo-caixa.js";
import type { FinanciamentoSimulado } from "./imobiliario-alugar-comprar.js";
import {
  centavos,
  exigirFracao,
  exigirInteiro,
  exigirNaoNegativo,
  exigirPositivo,
  somar,
  ZERO,
} from "./imobiliario-comum.js";
import { capRate, cashOnCash, rendimentoMensalLiquido, yieldBruto } from "./imobiliario-indicadores.js";

/**
 * Rentabilidade de um imóvel para renda, ano a ano: compra (com ou sem financiamento),
 * renda líquida, venda no fim do horizonte. Os números dependem inteiramente das
 * premissas informadas (renda, vacância, reajuste, valorização, taxa de desconto).
 */
export interface ParametrosRentabilidade {
  readonly valorCompra: Valor;
  /** ITBI, escritura e registro. */
  readonly custosAquisicao: Valor;
  readonly reforma?: Valor;
  /** Padrão: o valor de compra (sem financiamento). */
  readonly entrada?: Valor;
  readonly financiamento?: FinanciamentoSimulado;
  /** Aluguel (ou receita média de temporada) bruto por mês. */
  readonly rendaMensal: Valor;
  readonly vacancia?: number;
  readonly taxaAdministracao?: number;
  /** Despesas do proprietário por mês (IPTU, manutenção, seguro…). */
  readonly despesasMensais?: Valor;
  readonly reajusteAnual: number;
  readonly valorizacaoAnual: number;
  readonly horizonteAnos: number;
  /** Corretagem na venda ao fim do horizonte. */
  readonly custoVenda?: number;
  /** Taxa usada no VPL e no payback descontado (ex.: o CDI que você espera). */
  readonly taxaDescontoAnual: number;
}

export interface AnoRentabilidade {
  readonly ano: number;
  /** Renda líquida do ano antes das parcelas (NOI). */
  readonly receitaLiquida: Valor;
  readonly parcelas: Valor;
  readonly fluxoCaixa: Valor;
  readonly valorImovel: Valor;
  readonly saldoDevedor: Valor;
}

export interface ResultadoRentabilidade {
  readonly capitalProprio: Valor;
  readonly rendaLiquidaMensalInicial: Valor;
  readonly noiAnualInicial: Valor;
  readonly capRate: number | null;
  readonly yieldBruto: number | null;
  readonly yieldLiquido: number | null;
  readonly cashOnCashAno1: number | null;
  readonly anos: readonly AnoRentabilidade[];
  readonly valorVendaLiquido: Valor;
  /** Fluxos anuais do ano 0 (compra) ao último (com a venda). */
  readonly fluxos: readonly Valor[];
  readonly tirAnual: number | null;
  readonly vpl: Valor;
  readonly payback: number | null;
  readonly paybackDescontado: number | null;
  readonly premissas: readonly string[];
}

const PREMISSAS = [
  "Renda e despesas reajustam uma vez por ano pela taxa informada.",
  "O imóvel valoriza à taxa anual informada e é vendido no fim do horizonte.",
  "Vacância como fração do ano sem renda; administração sobre a renda recebida.",
  "Sem imposto de renda sobre aluguel nem sobre o ganho na venda (calcule à parte).",
  "Parcelas sem correção monetária.",
];

function financiar(p: ParametrosRentabilidade, entrada: Valor): TabelaAmortizacao | null {
  if (entrada.gt(p.valorCompra))
    throw new ErroParametroFinanceiro("a entrada não pode passar do valor de compra");
  const financiado = p.valorCompra.minus(entrada);
  if (financiado.isZero()) return null;
  if (!p.financiamento)
    throw new ErroParametroFinanceiro("com entrada menor que o valor de compra, informe o financiamento");
  return tabelaAmortizacao({ ...p.financiamento, valorFinanciado: financiado });
}

function noiDoAno(p: ParametrosRentabilidade, ano: number): Valor {
  const reajuste = dec(1 + p.reajusteAnual).pow(ano - 1);
  const renda = rendimentoMensalLiquido({
    aluguelMensal: p.rendaMensal.times(reajuste),
    vacancia: p.vacancia ?? 0,
    taxaAdministracao: p.taxaAdministracao ?? 0,
    despesas: { outras: (p.despesasMensais ?? ZERO).times(reajuste) },
  });
  return centavos(renda.liquido.times(12));
}

function anosDoHorizonte(p: ParametrosRentabilidade, tabela: TabelaAmortizacao | null): AnoRentabilidade[] {
  const anos: AnoRentabilidade[] = [];
  for (let ano = 1; ano <= p.horizonteAnos; ano++) {
    const linhas = tabela?.linhas.slice((ano - 1) * 12, ano * 12) ?? [];
    const parcelas = somar(linhas.map((l) => l.parcelaTotal));
    const ultima = linhas[linhas.length - 1];
    const receitaLiquida = noiDoAno(p, ano);
    anos.push({
      ano,
      receitaLiquida,
      parcelas,
      fluxoCaixa: receitaLiquida.minus(parcelas),
      valorImovel: centavos(p.valorCompra.times(dec(1 + p.valorizacaoAnual).pow(ano))),
      saldoDevedor: ultima ? ultima.saldoFinal : ZERO,
    });
  }
  return anos;
}

function validar(p: ParametrosRentabilidade): void {
  exigirPositivo(p.valorCompra, "o valor de compra");
  exigirNaoNegativo(p.custosAquisicao, "os custos de aquisição");
  exigirNaoNegativo(p.reforma ?? ZERO, "a reforma");
  exigirInteiro(p.horizonteAnos, "o horizonte em anos", 1, 50);
  exigirTaxa(p.reajusteAnual, "o reajuste anual");
  exigirTaxa(p.valorizacaoAnual, "a valorização anual");
  exigirTaxa(p.taxaDescontoAnual, "a taxa de desconto");
  exigirFracao(p.custoVenda ?? 0, "o custo de venda");
}

/** Simula a compra, a renda e a venda de um imóvel, ano a ano. */
export function rentabilidadeImovel(p: ParametrosRentabilidade): ResultadoRentabilidade {
  validar(p);
  const entrada = exigirNaoNegativo(p.entrada ?? p.valorCompra, "a entrada");
  const tabela = financiar(p, entrada);
  const capitalProprio = somar([entrada, p.custosAquisicao, p.reforma ?? ZERO]);
  const anos = anosDoHorizonte(p, tabela);
  const ultimo = anos[anos.length - 1] as AnoRentabilidade;
  const primeiro = anos[0] as AnoRentabilidade;
  const valorVendaLiquido = centavos(ultimo.valorImovel.times(1 - (p.custoVenda ?? 0)));
  const fluxos = [
    capitalProprio.neg(),
    ...anos.map((a) =>
      a === ultimo ? a.fluxoCaixa.plus(valorVendaLiquido).minus(a.saldoDevedor) : a.fluxoCaixa,
    ),
  ];
  return {
    capitalProprio,
    rendaLiquidaMensalInicial: primeiro.receitaLiquida.div(12),
    noiAnualInicial: primeiro.receitaLiquida,
    capRate: capRate(primeiro.receitaLiquida, p.valorCompra),
    yieldBruto: yieldBruto(p.rendaMensal, p.valorCompra),
    yieldLiquido: capRate(primeiro.receitaLiquida, p.valorCompra),
    cashOnCashAno1: cashOnCash(primeiro.fluxoCaixa, capitalProprio),
    anos,
    valorVendaLiquido,
    fluxos,
    tirAnual: tir(fluxos),
    vpl: vpl(p.taxaDescontoAnual, fluxos),
    payback: payback(fluxos),
    paybackDescontado: paybackDescontado(p.taxaDescontoAnual, fluxos),
    premissas: PREMISSAS,
  };
}
