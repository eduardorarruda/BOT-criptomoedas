import { dec, type Valor } from "@zentrade/dominio";
import { tabelaAmortizacao, type LinhaAmortizacao, type ParametrosFinanciamento } from "./amortizacao.js";
import { ErroParametroFinanceiro } from "./fluxo-caixa.js";
import {
  posicaoCotas,
  resumirFluxos,
  type LancamentoEmReais,
  type PosicaoCotas,
  type ResumoFluxos,
  type TipoInvestimentoImobiliario,
  type TipoLancamentoImobiliario,
} from "./imobiliario-carteira.js";
import { diaUtc, isoDeMs, MS_POR_DIA, somar, somarMesesMs, ZERO } from "./imobiliario-comum.js";
import { valorizacaoComposta } from "./imobiliario-indicadores.js";

/**
 * Resumo de um investimento imobiliário cadastrado, conforme o tipo: imóvel (com
 * ou sem financiamento), FII e REIT (cotas), crowdfunding e consórcio. O valor
 * atual vem, nesta ordem: da cotação, do valor informado, da valorização estimada
 * ou do custo — e o resumo diz de onde veio.
 */
export interface LancamentoImobiliario {
  /** AAAA-MM-DD. */
  readonly data: string;
  readonly tipo: TipoLancamentoImobiliario;
  readonly categoria: string;
  /** Na moeda do investimento. */
  readonly valor: Valor;
  readonly quantidade?: Valor | null;
  /** Reais por dólar no dia (obrigatório em investimento em USD). */
  readonly cambio?: Valor | null;
}

export interface FinanciamentoCadastrado extends ParametrosFinanciamento {
  readonly primeiraParcela: string;
}

export interface ConsorcioCadastrado {
  readonly valorCarta: Valor;
  readonly prazoMeses: number;
  /** Taxa de administração total do grupo (fração da carta). */
  readonly taxaAdministracao: number;
  readonly fundoReserva: number;
  readonly contempladoEm?: string | null;
}

export interface InvestimentoParaResumo {
  readonly tipo: TipoInvestimentoImobiliario;
  readonly moeda: "BRL" | "USD";
  readonly lancamentos: readonly LancamentoImobiliario[];
  /** Imóvel, crowdfunding, consórcio: valor do bem/saldo. FII/REIT: preço por cota. */
  readonly valorAtual?: Valor | null;
  readonly cambioAtual?: Valor | null;
  readonly valorizacaoAnual?: number | null;
  readonly financiamento?: FinanciamentoCadastrado | null;
  readonly consorcio?: ConsorcioCadastrado | null;
  /** Preço por cota vindo de cotação automática. */
  readonly precoCotacao?: Valor | null;
}

export interface OpcoesResumo {
  readonly dataBase: string;
  readonly cdiAnual?: number | null;
}

export type FonteValorAtual = "cotacao" | "manual" | "valorizacao" | "custo" | "vendido";

export interface ParcelaDatada {
  readonly vencimento: string;
  readonly linha: LinhaAmortizacao;
}

export interface ResumoInvestimentoImobiliario extends ResumoFluxos {
  readonly valorAtual: Valor;
  /** Valor atual na moeda do investimento (só USD). */
  readonly valorAtualMoeda: Valor | null;
  readonly fonteValorAtual: FonteValorAtual;
  readonly dividaAtual: Valor;
  readonly patrimonioLiquido: Valor;
  readonly encerrado: boolean;
  readonly cotas: PosicaoCotas | null;
  readonly dividendYield: number | null;
  readonly financiamento: { parcelasPagas: number; jurosPagos: Valor; saldoDevedor: Valor } | null;
  readonly consorcio: {
    parcelaEstimada: Valor;
    parcelasPagas: number;
    parcelasRestantes: number;
    lances: Valor;
    saldoEstimado: Valor;
    contemplado: boolean;
  } | null;
  readonly premissas: readonly string[];
}

const IMOVEIS: ReadonlySet<TipoInvestimentoImobiliario> = new Set([
  "aluguel",
  "temporada",
  "flip",
  "terreno",
  "planta",
]);
const COTAS: ReadonlySet<TipoInvestimentoImobiliario> = new Set(["fii", "reit"]);

function emReais(inv: InvestimentoParaResumo): LancamentoEmReais[] {
  return inv.lancamentos.map((l) => {
    if (inv.moeda === "USD" && !l.cambio) {
      throw new ErroParametroFinanceiro(`o lançamento de ${l.data} está em dólar e precisa do câmbio do dia`);
    }
    const valor = inv.moeda === "USD" ? l.valor.times(l.cambio as Valor) : l.valor;
    return {
      data: diaUtc(l.data),
      tipo: l.tipo,
      categoria: l.categoria,
      valor,
      quantidade: l.quantidade ?? null,
    };
  });
}

/** Parcelas do financiamento com a data de vencimento de cada uma. */
export function parcelasDoFinanciamento(f: FinanciamentoCadastrado): ParcelaDatada[] {
  const inicio = diaUtc(f.primeiraParcela);
  return tabelaAmortizacao(f).linhas.map((linha) => ({
    vencimento: isoDeMs(somarMesesMs(inicio, linha.mes - 1)),
    linha,
  }));
}

function cambioVigente(inv: InvestimentoParaResumo): Valor {
  if (inv.cambioAtual) return inv.cambioAtual;
  const comCambio = [...inv.lancamentos].filter((l) => l.cambio).sort((a, b) => a.data.localeCompare(b.data));
  const ultimo = comCambio[comCambio.length - 1];
  if (!ultimo?.cambio)
    throw new ErroParametroFinanceiro("informe o câmbio atual para avaliar o investimento em dólar");
  return ultimo.cambio;
}

interface Avaliacao {
  readonly valor: Valor;
  readonly valorMoeda: Valor | null;
  readonly fonte: FonteValorAtual;
}

function avaliarCotas(inv: InvestimentoParaResumo, posicao: PosicaoCotas): Avaliacao {
  const [preco, fonte]: [Valor | null, FonteValorAtual] = inv.precoCotacao
    ? [inv.precoCotacao, "cotacao"]
    : inv.valorAtual
      ? [inv.valorAtual, "manual"]
      : [null, "custo"];
  if (inv.moeda === "BRL") {
    return { valor: preco ? preco.times(posicao.quantidade) : posicao.custoTotal, valorMoeda: null, fonte };
  }
  const emDolar = preco ? preco.times(posicao.quantidade) : null;
  const cambio = posicao.quantidade.isZero() ? dec(1) : cambioVigente(inv);
  return { valor: emDolar ? emDolar.times(cambio) : posicao.custoTotal, valorMoeda: emDolar, fonte };
}

function avaliarImovel(
  inv: InvestimentoParaResumo,
  ls: readonly LancamentoEmReais[],
  base: number,
): Avaliacao {
  if (ls.some((l) => l.tipo === "resgate" && l.categoria === "venda")) {
    return { valor: ZERO, valorMoeda: null, fonte: "vendido" };
  }
  if (inv.valorAtual) return { valor: inv.valorAtual, valorMoeda: null, fonte: "manual" };
  const aportes = ls.filter((l) => l.tipo === "aporte");
  const custo = somar(aportes.map((l) => l.valor)).plus(inv.financiamento?.valorFinanciado ?? ZERO);
  const primeiro = Math.min(...aportes.map((l) => l.data));
  if (!inv.valorizacaoAnual || aportes.length === 0)
    return { valor: custo, valorMoeda: null, fonte: "custo" };
  const anos = Math.max(0, (base - primeiro) / MS_POR_DIA / 365);
  return {
    valor: valorizacaoComposta(custo, inv.valorizacaoAnual, anos),
    valorMoeda: null,
    fonte: "valorizacao",
  };
}

function avaliarOutros(inv: InvestimentoParaResumo, ls: readonly LancamentoEmReais[]): Avaliacao {
  if (inv.valorAtual) return { valor: inv.valorAtual, valorMoeda: null, fonte: "manual" };
  const aportes = somar(ls.filter((l) => l.tipo === "aporte").map((l) => l.valor));
  const devolvido =
    inv.tipo === "crowdfunding" ? somar(ls.filter((l) => l.tipo === "resgate").map((l) => l.valor)) : ZERO;
  const capital = aportes.minus(devolvido);
  return { valor: capital.isNegative() ? ZERO : capital, valorMoeda: null, fonte: "custo" };
}

function situacaoFinanciamento(f: FinanciamentoCadastrado, ate: number) {
  const pagas = parcelasDoFinanciamento(f).filter((p) => diaUtc(p.vencimento) <= ate);
  const ultima = pagas[pagas.length - 1];
  return {
    parcelas: pagas.map((p) => ({ data: diaUtc(p.vencimento), valor: p.linha.parcelaTotal })),
    resumo: {
      parcelasPagas: pagas.length,
      jurosPagos: somar(
        pagas.map((p) => p.linha.juros.plus(p.linha.seguros).plus(p.linha.taxaAdministracao)),
      ),
      saldoDevedor: ultima ? ultima.linha.saldoFinal : f.valorFinanciado,
    },
  };
}

function situacaoConsorcio(c: ConsorcioCadastrado, ls: readonly LancamentoEmReais[], base: number) {
  const parcelaEstimada = c.valorCarta.times(1 + c.taxaAdministracao + c.fundoReserva).div(c.prazoMeses);
  const parcelasPagas = ls.filter((l) => l.tipo === "aporte" && l.categoria === "parcela").length;
  const parcelasRestantes = Math.max(0, c.prazoMeses - parcelasPagas);
  return {
    parcelaEstimada,
    parcelasPagas,
    parcelasRestantes,
    lances: somar(ls.filter((l) => l.tipo === "aporte" && l.categoria === "lance").map((l) => l.valor)),
    saldoEstimado: parcelaEstimada.times(parcelasRestantes),
    contemplado: !!c.contempladoEm && diaUtc(c.contempladoEm) <= base,
  };
}

function premissasDe(inv: InvestimentoParaResumo, fonte: FonteValorAtual): string[] {
  const p: string[] = [];
  if (fonte === "custo")
    p.push("Sem valor atual informado: o investimento aparece pelo custo, sem ganho nem perda.");
  if (fonte === "valorizacao")
    p.push(
      `Valor atual estimado: o custo valoriza ${(inv.valorizacaoAnual ?? 0) * 100}% ao ano (premissa sua).`,
    );
  if (inv.financiamento)
    p.push(
      "Parcelas com vencimento até a data-base contam como pagas; o saldo devedor é descontado do patrimônio.",
    );
  if (inv.moeda === "USD")
    p.push("Lançamentos em dólar convertidos pelo câmbio de cada dia; o valor atual, pelo câmbio atual.");
  if (inv.consorcio)
    p.push(
      "Parcela do consórcio estimada sem reajuste (INCC ou outro índice); o saldo só vira dívida depois da contemplação.",
    );
  p.push(
    "TIR e comparação com o CDI usam as datas dos lançamentos; resultado sem imposto sobre ganho não realizado.",
  );
  return p;
}

/** Resumo completo de um investimento na data-base. */
export function resumirInvestimentoImobiliario(
  inv: InvestimentoParaResumo,
  opcoes: OpcoesResumo,
): ResumoInvestimentoImobiliario {
  const base = diaUtc(opcoes.dataBase);
  const ls = emReais(inv).filter((l) => l.data <= base);
  const cotas = COTAS.has(inv.tipo) ? posicaoCotas(ls) : null;
  const aval = cotas
    ? avaliarCotas(inv, cotas)
    : IMOVEIS.has(inv.tipo)
      ? avaliarImovel(inv, ls, base)
      : avaliarOutros(inv, ls);
  const encerrado = aval.fonte === "vendido";
  const fin = inv.financiamento ? situacaoFinanciamento(inv.financiamento, base) : null;
  const consorcio = inv.consorcio ? situacaoConsorcio(inv.consorcio, ls, base) : null;
  const divida = encerrado
    ? ZERO
    : (fin?.resumo.saldoDevedor ?? (consorcio?.contemplado ? consorcio.saldoEstimado : ZERO));
  const patrimonioLiquido = aval.valor.minus(divida);
  const fluxos = resumirFluxos({
    lancamentos: ls,
    parcelas: fin?.parcelas ?? [],
    patrimonioLiquido,
    dataBase: base,
    cdiAnual: opcoes.cdiAnual ?? null,
  });
  return {
    ...fluxos,
    valorAtual: aval.valor,
    valorAtualMoeda: aval.valorMoeda,
    fonteValorAtual: aval.fonte,
    dividaAtual: divida,
    patrimonioLiquido,
    encerrado,
    cotas,
    dividendYield: cotas && aval.valor.gt(0) ? fluxos.renda12Meses.div(aval.valor).toNumber() : null,
    financiamento: fin?.resumo ?? null,
    consorcio,
    premissas: premissasDe(inv, aval.fonte),
  };
}
