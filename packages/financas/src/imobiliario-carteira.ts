import type { Valor } from "@zentrade/dominio";
import { ErroParametroFinanceiro, tirDatada, valorFuturoDatado, type FluxoDatado } from "./fluxo-caixa.js";
import { MS_POR_DIA, razao, somar, ZERO } from "./imobiliario-comum.js";

/**
 * Acompanhamento de um investimento pelos seus lançamentos: quanto entrou, quanto
 * voltou, quanto vale hoje, a TIR realizada e a comparação com o CDI informado.
 *
 * Tipos de lançamento: `aporte` (dinheiro posto: compra, ITBI, reforma, parcela de
 * consórcio, compra de cotas), `receita` (aluguel, diária, provento, juros),
 * `despesa` (condomínio, IPTU, manutenção, administração…), `resgate` (venda,
 * devolução de capital) e `imposto`. Valores sempre positivos e em reais.
 */
export const TIPOS_INVESTIMENTO_IMOBILIARIO = [
  "aluguel",
  "temporada",
  "flip",
  "terreno",
  "planta",
  "fii",
  "reit",
  "crowdfunding",
  "consorcio",
] as const;
export type TipoInvestimentoImobiliario = (typeof TIPOS_INVESTIMENTO_IMOBILIARIO)[number];

export const TIPOS_LANCAMENTO_IMOBILIARIO = ["aporte", "receita", "despesa", "resgate", "imposto"] as const;
export type TipoLancamentoImobiliario = (typeof TIPOS_LANCAMENTO_IMOBILIARIO)[number];

export interface LancamentoEmReais {
  /** ms UTC da meia-noite do dia. */
  readonly data: number;
  readonly tipo: TipoLancamentoImobiliario;
  readonly categoria: string;
  readonly valor: Valor;
  /** Cotas compradas (aporte) ou vendidas (resgate). */
  readonly quantidade?: Valor | null;
}

export interface EntradaFluxos {
  readonly lancamentos: readonly LancamentoEmReais[];
  /** Parcelas de financiamento já pagas (saídas de caixa). */
  readonly parcelas?: readonly FluxoDatado[];
  /** Valor atual menos dívidas, na data-base. */
  readonly patrimonioLiquido: Valor;
  readonly dataBase: number;
  readonly cdiAnual?: number | null;
}

export interface ComparacaoCdi {
  readonly taxaAnual: number;
  /** Quanto o mesmo dinheiro, com os mesmos aportes e retiradas, valeria no CDI. */
  readonly valorEquivalente: Valor;
  /** Patrimônio líquido − valor equivalente no CDI. */
  readonly diferenca: Valor;
}

export interface ResumoFluxos {
  readonly investido: Valor;
  readonly rendaAcumulada: Valor;
  readonly despesas: Valor;
  readonly impostos: Valor;
  readonly resgatado: Valor;
  readonly parcelasPagas: Valor;
  readonly resultadoBruto: Valor;
  readonly resultadoLiquido: Valor;
  readonly tirAnual: number | null;
  readonly renda12Meses: Valor;
  readonly rendaMensalMedia: Valor;
  readonly rendaMensalLiquidaMedia: Valor;
  readonly cdi: ComparacaoCdi | null;
}

const SAIDAS: ReadonlySet<TipoLancamentoImobiliario> = new Set(["aporte", "despesa", "imposto"]);
const DIAS_RENDA = 365;

const somaDo = (ls: readonly LancamentoEmReais[], tipo: TipoLancamentoImobiliario): Valor =>
  somar(ls.filter((x) => x.tipo === tipo).map((x) => x.valor));

/** Fluxos do ponto de vista do bolso: saída negativa, entrada positiva. */
function fluxosDoBolso(ls: readonly LancamentoEmReais[], parcelas: readonly FluxoDatado[]): FluxoDatado[] {
  return [
    ...ls.map((x) => ({ data: x.data, valor: SAIDAS.has(x.tipo) ? x.valor.neg() : x.valor })),
    ...parcelas.map((p) => ({ data: p.data, valor: p.valor.neg() })),
  ];
}

function rendaRecente(ls: readonly LancamentoEmReais[], dataBase: number) {
  const inicio = dataBase - DIAS_RENDA * MS_POR_DIA;
  const recentes = ls.filter((x) => x.data > inicio);
  const renda = somaDo(recentes, "receita");
  return { renda, liquida: renda.minus(somaDo(recentes, "despesa")) };
}

export function resumirFluxos(e: EntradaFluxos): ResumoFluxos {
  const ls = e.lancamentos.filter((x) => x.data <= e.dataBase);
  const parcelas = (e.parcelas ?? []).filter((p) => p.data <= e.dataBase);
  const investido = somaDo(ls, "aporte");
  const rendaAcumulada = somaDo(ls, "receita");
  const despesas = somaDo(ls, "despesa");
  const impostos = somaDo(ls, "imposto");
  const resgatado = somaDo(ls, "resgate");
  const parcelasPagas = somar(parcelas.map((p) => p.valor));
  const resultadoBruto = e.patrimonioLiquido
    .plus(resgatado)
    .plus(rendaAcumulada)
    .minus(investido)
    .minus(parcelasPagas);
  const bolso = fluxosDoBolso(ls, parcelas);
  const final = { data: e.dataBase, valor: e.patrimonioLiquido };
  const recente = rendaRecente(ls, e.dataBase);
  return {
    investido,
    rendaAcumulada,
    despesas,
    impostos,
    resgatado,
    parcelasPagas,
    resultadoBruto,
    resultadoLiquido: resultadoBruto.minus(despesas).minus(impostos),
    tirAnual: tirDatada([...bolso, final], { tolerancia: 1e-9 }),
    renda12Meses: recente.renda,
    rendaMensalMedia: recente.renda.div(12),
    rendaMensalLiquidaMedia: recente.liquida.div(12),
    cdi: compararCdi(bolso, e),
  };
}

function compararCdi(bolso: readonly FluxoDatado[], e: EntradaFluxos): ComparacaoCdi | null {
  if (e.cdiAnual === undefined || e.cdiAnual === null) return null;
  const aplicado = bolso.map((f) => ({ data: f.data, valor: f.valor.neg() }));
  const valorEquivalente = valorFuturoDatado(e.cdiAnual, aplicado, e.dataBase);
  return { taxaAnual: e.cdiAnual, valorEquivalente, diferenca: e.patrimonioLiquido.minus(valorEquivalente) };
}

export interface PosicaoCotas {
  readonly quantidade: Valor;
  readonly custoTotal: Valor;
  readonly precoMedio: Valor | null;
  /** Vendas − custo médio das cotas vendidas. */
  readonly resultadoRealizado: Valor;
}

/** Posição em cotas pelo preço médio (aporte com quantidade = compra; resgate com quantidade = venda). */
export function posicaoCotas(ls: readonly LancamentoEmReais[]): PosicaoCotas {
  let quantidade = ZERO;
  let custoTotal = ZERO;
  let resultadoRealizado = ZERO;
  const ordenados = [...ls].sort((a, b) => a.data - b.data);
  for (const x of ordenados) {
    if (!x.quantidade || x.quantidade.isZero()) continue;
    if (x.tipo === "aporte") {
      quantidade = quantidade.plus(x.quantidade);
      custoTotal = custoTotal.plus(x.valor);
    } else if (x.tipo === "resgate") {
      if (x.quantidade.gt(quantidade)) {
        throw new ErroParametroFinanceiro("há venda de mais cotas do que havia na carteira naquela data");
      }
      const custoVendido = custoTotal.times(x.quantidade).div(quantidade);
      resultadoRealizado = resultadoRealizado.plus(x.valor.minus(custoVendido));
      custoTotal = custoTotal.minus(custoVendido);
      quantidade = quantidade.minus(x.quantidade);
    }
  }
  const precoMedio = quantidade.isZero() ? null : custoTotal.div(quantidade);
  return { quantidade, custoTotal, precoMedio, resultadoRealizado };
}

export interface ItemCarteira {
  readonly tipo: TipoInvestimentoImobiliario;
  readonly patrimonioLiquido: Valor;
  readonly investido: Valor;
  readonly rendaMensalLiquidaMedia: Valor;
  readonly resultadoLiquido: Valor;
}

export interface AlocacaoTipo {
  readonly tipo: TipoInvestimentoImobiliario;
  readonly valor: Valor;
  readonly fracao: number;
}

/** Soma da carteira e alocação por tipo (só patrimônio positivo entra na alocação). */
export function consolidarCarteiraImobiliaria(itens: readonly ItemCarteira[]) {
  const porTipo = new Map<TipoInvestimentoImobiliario, Valor>();
  for (const i of itens) {
    if (i.patrimonioLiquido.gt(0))
      porTipo.set(i.tipo, (porTipo.get(i.tipo) ?? ZERO).plus(i.patrimonioLiquido));
  }
  const totalPositivo = somar([...porTipo.values()]);
  const alocacao: AlocacaoTipo[] = [...porTipo.entries()]
    .map(([tipo, valor]) => ({ tipo, valor, fracao: razao(valor, totalPositivo) ?? 0 }))
    .sort((a, b) => b.valor.comparedTo(a.valor));
  return {
    patrimonio: somar(itens.map((i) => i.patrimonioLiquido)),
    investido: somar(itens.map((i) => i.investido)),
    rendaMensal: somar(itens.map((i) => i.rendaMensalLiquidaMedia)),
    resultadoLiquido: somar(itens.map((i) => i.resultadoLiquido)),
    alocacao,
    quantidade: itens.length,
  };
}
