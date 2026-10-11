import { dec, paraTexto, type Valor } from "@zentrade/dominio";
import {
  tabelaAmortizacao,
  type LinhaAmortizacao,
  type SistemaAmortizacao,
  type TabelaAmortizacao,
} from "./amortizacao.js";
import {
  consolidarCarteiraImobiliaria,
  type TipoInvestimentoImobiliario,
  type TipoLancamentoImobiliario,
} from "./imobiliario-carteira.js";
import { centavos, diaUtc, isoDeMs, somarMesesMs } from "./imobiliario-comum.js";
import {
  resumirInvestimentoImobiliario,
  type FinanciamentoCadastrado,
  type InvestimentoParaResumo,
  type ResumoInvestimentoImobiliario,
} from "./imobiliario-investimento.js";

/**
 * Ponte entre o contrato da API (dinheiro em texto decimal) e as contas em Valor.
 * Os tipos são estruturais: os DTOs de @zentrade/contratos encaixam sem conversão,
 * e a API e a tela (modo de demonstração) usam as mesmas funções. Dinheiro sai
 * arredondado aos centavos; quantidades e preço médio, sem arredondar.
 */
export interface FinanciamentoEmTexto {
  readonly sistema: SistemaAmortizacao;
  readonly valorFinanciado: string;
  readonly taxaAnual: number;
  readonly prazoMeses: number;
  readonly primeiraParcela: string;
  readonly seguroTaxaMensalSaldo?: number | undefined;
  readonly seguroFixoMensal?: string | undefined;
  readonly taxaAdministracaoMensal?: string | undefined;
  readonly custosIniciais?: string | undefined;
}

export interface InvestimentoEmTexto {
  readonly tipo: TipoInvestimentoImobiliario;
  readonly moeda: "BRL" | "USD";
  readonly valorAtual: string | null;
  readonly cambioAtual: string | null;
  readonly valorizacaoAnual: number | null;
  readonly prazoMeses: number | null;
  readonly valorCarta: string | null;
  readonly taxaAdministracao: number | null;
  readonly fundoReserva: number | null;
  readonly contempladoEm: string | null;
  readonly financiamento: FinanciamentoEmTexto | null;
}

export interface LancamentoEmTexto {
  readonly data: string;
  readonly tipo: TipoLancamentoImobiliario;
  readonly categoria: string;
  readonly valor: string;
  readonly quantidade: string | null;
  readonly cambio: string | null;
}

export interface OpcoesEmTexto {
  readonly dataBase: string;
  readonly cdiAnual?: number | null | undefined;
  readonly precoCotacao?: string | null | undefined;
}

const reais = (v: Valor): string => paraTexto(centavos(v));
const reaisOuNulo = (v: Valor | null): string | null => (v === null ? null : reais(v));
const valorOuNulo = (v: string | null | undefined): Valor | null => (v ? dec(v) : null);

function financiamentoDeTexto(f: FinanciamentoEmTexto): FinanciamentoCadastrado {
  return {
    sistema: f.sistema,
    valorFinanciado: dec(f.valorFinanciado),
    taxaAnual: f.taxaAnual,
    prazoMeses: f.prazoMeses,
    primeiraParcela: f.primeiraParcela,
    ...(f.seguroTaxaMensalSaldo !== undefined ? { seguroTaxaMensalSaldo: f.seguroTaxaMensalSaldo } : {}),
    ...(f.seguroFixoMensal ? { seguroFixoMensal: dec(f.seguroFixoMensal) } : {}),
    ...(f.taxaAdministracaoMensal ? { taxaAdministracaoMensal: dec(f.taxaAdministracaoMensal) } : {}),
    ...(f.custosIniciais ? { custosIniciais: dec(f.custosIniciais) } : {}),
  };
}

function paraResumo(
  inv: InvestimentoEmTexto,
  ls: readonly LancamentoEmTexto[],
  preco?: string | null,
): InvestimentoParaResumo {
  const consorcio =
    inv.tipo === "consorcio" && inv.valorCarta && inv.prazoMeses
      ? {
          valorCarta: dec(inv.valorCarta),
          prazoMeses: inv.prazoMeses,
          taxaAdministracao: inv.taxaAdministracao ?? 0,
          fundoReserva: inv.fundoReserva ?? 0,
          contempladoEm: inv.contempladoEm,
        }
      : null;
  return {
    tipo: inv.tipo,
    moeda: inv.moeda,
    lancamentos: ls.map((l) => ({
      data: l.data,
      tipo: l.tipo,
      categoria: l.categoria,
      valor: dec(l.valor),
      quantidade: valorOuNulo(l.quantidade),
      cambio: valorOuNulo(l.cambio),
    })),
    valorAtual: valorOuNulo(inv.valorAtual),
    cambioAtual: valorOuNulo(inv.cambioAtual),
    valorizacaoAnual: inv.valorizacaoAnual,
    financiamento: inv.financiamento ? financiamentoDeTexto(inv.financiamento) : null,
    consorcio,
    precoCotacao: valorOuNulo(preco),
  };
}

function detalhesEmTexto(r: ResumoInvestimentoImobiliario) {
  return {
    cdi: r.cdi && {
      taxaAnual: r.cdi.taxaAnual,
      valorEquivalente: reais(r.cdi.valorEquivalente),
      diferenca: reais(r.cdi.diferenca),
    },
    cotas: r.cotas && {
      quantidade: paraTexto(r.cotas.quantidade),
      precoMedio: r.cotas.precoMedio ? paraTexto(r.cotas.precoMedio.toDecimalPlaces(6)) : null,
      custoTotal: reais(r.cotas.custoTotal),
      resultadoRealizado: reais(r.cotas.resultadoRealizado),
    },
    financiamento: r.financiamento && {
      parcelasPagas: r.financiamento.parcelasPagas,
      jurosPagos: reais(r.financiamento.jurosPagos),
      saldoDevedor: reais(r.financiamento.saldoDevedor),
    },
    consorcio: r.consorcio && {
      ...r.consorcio,
      parcelaEstimada: reais(r.consorcio.parcelaEstimada),
      lances: reais(r.consorcio.lances),
      saldoEstimado: reais(r.consorcio.saldoEstimado),
    },
  };
}

/** Métricas de um investimento no formato do contrato (MetricasImobiliarioEsquema). */
export function metricasEmTexto(
  inv: InvestimentoEmTexto,
  ls: readonly LancamentoEmTexto[],
  o: OpcoesEmTexto,
) {
  const r = resumirInvestimentoImobiliario(paraResumo(inv, ls, o.precoCotacao), {
    dataBase: o.dataBase,
    cdiAnual: o.cdiAnual ?? null,
  });
  return {
    investido: reais(r.investido),
    rendaAcumulada: reais(r.rendaAcumulada),
    despesas: reais(r.despesas),
    impostos: reais(r.impostos),
    resgatado: reais(r.resgatado),
    parcelasPagas: reais(r.parcelasPagas),
    valorAtual: reais(r.valorAtual),
    valorAtualMoeda: reaisOuNulo(r.valorAtualMoeda),
    fonteValorAtual: r.fonteValorAtual,
    dividaAtual: reais(r.dividaAtual),
    patrimonioLiquido: reais(r.patrimonioLiquido),
    resultadoBruto: reais(r.resultadoBruto),
    resultadoLiquido: reais(r.resultadoLiquido),
    tirAnual: r.tirAnual,
    renda12Meses: reais(r.renda12Meses),
    rendaMensalMedia: reais(r.rendaMensalMedia),
    rendaMensalLiquidaMedia: reais(r.rendaMensalLiquidaMedia),
    encerrado: r.encerrado,
    dividendYield: r.dividendYield,
    ...detalhesEmTexto(r),
    premissas: [...r.premissas],
  };
}

export type MetricasEmTexto = ReturnType<typeof metricasEmTexto>;

const linhaEmTexto = (l: LinhaAmortizacao, vencimento: string | null) => ({
  mes: l.mes,
  vencimento,
  saldoInicial: reais(l.saldoInicial),
  juros: reais(l.juros),
  amortizacao: reais(l.amortizacao),
  prestacao: reais(l.prestacao),
  seguros: reais(l.seguros),
  taxaAdministracao: reais(l.taxaAdministracao),
  parcelaTotal: reais(l.parcelaTotal),
  saldoFinal: reais(l.saldoFinal),
});

function totaisEmTexto(t: TabelaAmortizacao) {
  return {
    sistema: t.sistema,
    taxaMensal: t.taxaMensal,
    totalJuros: reais(t.totalJuros),
    totalAmortizado: reais(t.totalAmortizado),
    totalSeguros: reais(t.totalSeguros),
    totalTaxas: reais(t.totalTaxas),
    totalPago: reais(t.totalPago),
    primeiraParcela: reais(t.primeiraParcela),
    ultimaParcela: reais(t.ultimaParcela),
    cetMensal: t.cetMensal,
    cetAnual: t.cetAnual,
  };
}

/** Tabela do financiamento cadastrado, com o vencimento de cada parcela. */
export function tabelaEmTexto(f: FinanciamentoEmTexto) {
  const t = tabelaAmortizacao(financiamentoDeTexto(f));
  const primeira = diaUtc(f.primeiraParcela);
  return {
    ...totaisEmTexto(t),
    linhas: t.linhas.map((l) => linhaEmTexto(l, isoDeMs(somarMesesMs(primeira, l.mes - 1)))),
  };
}

export type TabelaEmTexto = ReturnType<typeof tabelaEmTexto>;

/** SAC e Price lado a lado, nas mesmas condições (simulador). */
export function simulacaoFinanciamentoEmTexto(p: Omit<FinanciamentoEmTexto, "sistema" | "primeiraParcela">): {
  sac: TabelaEmTexto;
  price: TabelaEmTexto;
} {
  const uma = (sistema: SistemaAmortizacao): TabelaEmTexto => {
    const t = tabelaAmortizacao(financiamentoDeTexto({ ...p, sistema, primeiraParcela: "2000-01-01" }));
    return { ...totaisEmTexto(t), linhas: t.linhas.map((l) => linhaEmTexto(l, null)) };
  };
  return { sac: uma("SAC"), price: uma("PRICE") };
}

interface ItemVisao {
  readonly tipo: TipoInvestimentoImobiliario;
  readonly metricas: {
    readonly patrimonioLiquido: string;
    readonly investido: string;
    readonly rendaMensalLiquidaMedia: string;
    readonly resultadoLiquido: string;
  } | null;
}

/** Soma da carteira (itens sem métricas entram só na contagem). */
export function visaoEmTexto(itens: readonly ItemVisao[], o: { dataBase: string; cdiAnual: number | null }) {
  const c = consolidarCarteiraImobiliaria(
    itens.flatMap((i) =>
      i.metricas
        ? [
            {
              tipo: i.tipo,
              patrimonioLiquido: dec(i.metricas.patrimonioLiquido),
              investido: dec(i.metricas.investido),
              rendaMensalLiquidaMedia: dec(i.metricas.rendaMensalLiquidaMedia),
              resultadoLiquido: dec(i.metricas.resultadoLiquido),
            },
          ]
        : [],
    ),
  );
  return {
    dataBase: o.dataBase,
    cdiAnual: o.cdiAnual,
    patrimonio: reais(c.patrimonio),
    investido: reais(c.investido),
    rendaMensal: reais(c.rendaMensal),
    resultadoLiquido: reais(c.resultadoLiquido),
    quantidade: itens.length,
    alocacao: c.alocacao.map((a) => ({ tipo: a.tipo, valor: reais(a.valor), fracao: a.fracao })),
  };
}
