import { dec, type Valor } from "@zentrade/dominio";
import { exigirTaxa, taxaAnualDeMensalFracao, taxaMensalDeAnualFracao, tir } from "./fluxo-caixa.js";
import {
  centavos,
  exigirFracao,
  exigirInteiro,
  exigirNaoNegativo,
  exigirPositivo,
  somar,
  ZERO,
} from "./imobiliario-comum.js";

/**
 * Tabelas de amortização SAC e Price, mês a mês, com juros, amortização, seguros,
 * taxa de administração e saldo. Cada valor é arredondado aos centavos (meio para
 * cima) e a diferença de arredondamento fica na última parcela, que zera o saldo.
 *
 * Premissas: taxa anual efetiva convertida em mensal equivalente; parcelas sem
 * correção monetária (TR, IPCA); seguros simplificados (um percentual mensal sobre
 * o saldo, como o MIP, e um valor fixo, como o DFI). O CET é aproximado: a TIR do
 * que entra (valor financiado menos tarifas) contra tudo o que sai (parcela total).
 */
export type SistemaAmortizacao = "SAC" | "PRICE";

export const PRAZO_MAXIMO_MESES = 600;

export interface ParametrosFinanciamento {
  readonly sistema: SistemaAmortizacao;
  readonly valorFinanciado: Valor;
  /** Taxa de juros efetiva ao ano (fração: 0,1 = 10% a.a.). */
  readonly taxaAnual: number;
  readonly prazoMeses: number;
  /** Seguro sobre o saldo devedor, por mês (fração: 0,0003 = 0,03% a.m.). */
  readonly seguroTaxaMensalSaldo?: number;
  /** Seguro em valor fixo por mês (R$). */
  readonly seguroFixoMensal?: Valor;
  /** Taxa de administração do contrato por mês (R$). */
  readonly taxaAdministracaoMensal?: Valor;
  /** Tarifas pagas na contratação (avaliação, registro do contrato…): só entram no CET. */
  readonly custosIniciais?: Valor;
}

export interface LinhaAmortizacao {
  readonly mes: number;
  readonly saldoInicial: Valor;
  readonly juros: Valor;
  readonly amortizacao: Valor;
  /** Juros + amortização. */
  readonly prestacao: Valor;
  readonly seguros: Valor;
  readonly taxaAdministracao: Valor;
  /** Prestação + seguros + taxa: o que sai do bolso no mês. */
  readonly parcelaTotal: Valor;
  readonly saldoFinal: Valor;
}

export interface TabelaAmortizacao {
  readonly sistema: SistemaAmortizacao;
  readonly taxaMensal: number;
  readonly linhas: readonly LinhaAmortizacao[];
  readonly totalJuros: Valor;
  readonly totalAmortizado: Valor;
  readonly totalSeguros: Valor;
  readonly totalTaxas: Valor;
  readonly totalPago: Valor;
  readonly primeiraParcela: Valor;
  readonly ultimaParcela: Valor;
  /** Custo efetivo total aproximado (null se não der para calcular). */
  readonly cetMensal: number | null;
  readonly cetAnual: number | null;
}

interface Validado {
  readonly sistema: SistemaAmortizacao;
  readonly valor: Valor;
  readonly taxaMensal: Valor;
  readonly prazo: number;
  readonly seguroTaxa: Valor;
  readonly seguroFixo: Valor;
  readonly taxaAdm: Valor;
  readonly custosIniciais: Valor;
}

function validar(p: ParametrosFinanciamento): Validado {
  exigirTaxa(p.taxaAnual, "a taxa anual");
  return {
    sistema: p.sistema,
    valor: exigirPositivo(p.valorFinanciado, "o valor financiado"),
    taxaMensal: dec(taxaMensalDeAnualFracao(exigirFracao(p.taxaAnual, "a taxa anual", 0, 10))),
    prazo: exigirInteiro(p.prazoMeses, "o prazo em meses", 1, PRAZO_MAXIMO_MESES),
    seguroTaxa: dec(exigirFracao(p.seguroTaxaMensalSaldo ?? 0, "o seguro sobre o saldo", 0, 0.1)),
    seguroFixo: exigirNaoNegativo(p.seguroFixoMensal ?? ZERO, "o seguro fixo"),
    taxaAdm: exigirNaoNegativo(p.taxaAdministracaoMensal ?? ZERO, "a taxa de administração"),
    custosIniciais: exigirNaoNegativo(p.custosIniciais ?? ZERO, "os custos iniciais"),
  };
}

/** Prestação constante da Price: PV·i / (1 − (1+i)^−n); com taxa zero, PV/n. */
function prestacaoPrice(v: Validado): Valor {
  if (v.taxaMensal.isZero()) return centavos(v.valor.div(v.prazo));
  const desconto = dec(1).minus(v.taxaMensal.plus(1).pow(-v.prazo));
  return centavos(v.valor.times(v.taxaMensal).div(desconto));
}

function montarLinhas(v: Validado): LinhaAmortizacao[] {
  const constante = v.sistema === "PRICE" ? prestacaoPrice(v) : centavos(v.valor.div(v.prazo));
  const linhas: LinhaAmortizacao[] = [];
  let saldo = v.valor;
  for (let mes = 1; mes <= v.prazo; mes++) {
    const juros = centavos(saldo.times(v.taxaMensal));
    const normal = v.sistema === "PRICE" ? constante.minus(juros) : constante;
    const amortizacao = mes === v.prazo ? saldo : menor(normal, saldo);
    const seguros = centavos(saldo.times(v.seguroTaxa)).plus(v.seguroFixo);
    const prestacao = juros.plus(amortizacao);
    const saldoFinal = saldo.minus(amortizacao);
    linhas.push({
      mes,
      saldoInicial: saldo,
      juros,
      amortizacao,
      prestacao,
      seguros,
      taxaAdministracao: v.taxaAdm,
      parcelaTotal: prestacao.plus(seguros).plus(v.taxaAdm),
      saldoFinal,
    });
    saldo = saldoFinal;
  }
  return linhas;
}

const menor = (a: Valor, b: Valor): Valor => (a.lt(b) ? a : b);

function cet(
  v: Validado,
  linhas: readonly LinhaAmortizacao[],
): { mensal: number | null; anual: number | null } {
  const fluxos = [v.valor.minus(v.custosIniciais), ...linhas.map((l) => l.parcelaTotal.neg())];
  const mensal = tir(fluxos, { tolerancia: 1e-12 });
  return { mensal, anual: mensal === null ? null : taxaAnualDeMensalFracao(mensal) };
}

/** Tabela completa do financiamento, mês a mês. */
export function tabelaAmortizacao(p: ParametrosFinanciamento): TabelaAmortizacao {
  const v = validar(p);
  const linhas = montarLinhas(v);
  const custo = cet(v, linhas);
  const primeira = linhas[0] as LinhaAmortizacao;
  const ultima = linhas[linhas.length - 1] as LinhaAmortizacao;
  return {
    sistema: v.sistema,
    taxaMensal: v.taxaMensal.toNumber(),
    linhas,
    totalJuros: somar(linhas.map((l) => l.juros)),
    totalAmortizado: somar(linhas.map((l) => l.amortizacao)),
    totalSeguros: somar(linhas.map((l) => l.seguros)),
    totalTaxas: somar(linhas.map((l) => l.taxaAdministracao)),
    totalPago: somar(linhas.map((l) => l.parcelaTotal)),
    primeiraParcela: primeira.parcelaTotal,
    ultimaParcela: ultima.parcelaTotal,
    cetMensal: custo.mensal,
    cetAnual: custo.anual,
  };
}

/** Saldo devedor depois de pagas `parcelas` parcelas (0 = o valor financiado). */
export function saldoDevedorApos(tabela: TabelaAmortizacao, parcelas: number): Valor {
  if (parcelas <= 0) return (tabela.linhas[0] as LinhaAmortizacao).saldoInicial;
  const linha = tabela.linhas[Math.min(parcelas, tabela.linhas.length) - 1] as LinhaAmortizacao;
  return linha.saldoFinal;
}
