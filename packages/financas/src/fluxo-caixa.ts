import { dec, type Valor } from "@zentrade/dominio";

/**
 * Fluxo de caixa: VPL, TIR, taxas equivalentes e payback. Valores em dinheiro são
 * sempre Valor (decimal exato); taxas são `number` (fração: 0,01 = 1%).
 *
 * Convenção de sinal: dinheiro que sai do bolso é negativo; o que volta é positivo.
 * Nos fluxos periódicos, `fluxos[0]` acontece em t = 0 (hoje, sem desconto).
 */
export class ErroParametroFinanceiro extends RangeError {
  override name = "ErroParametroFinanceiro";
}

const MS_POR_DIA = 86_400_000;
const DIAS_POR_ANO = 365;
/** A TIR é procurada a partir de -99% (abaixo disso o desconto explode). */
const TAXA_MINIMA = -0.99;
/** Teto da busca: 1.000.000% por período. Acima disso não há TIR que faça sentido. */
const TAXA_MAXIMA = 1e4;
const TOLERANCIA_PADRAO = 1e-10;
const ITERACOES_PADRAO = 300;

export interface FluxoDatado {
  /** Instante em ms UTC (use a meia-noite UTC do dia). */
  readonly data: number;
  readonly valor: Valor;
}

export interface OpcoesTir {
  /** Largura final do intervalo da bisseção (padrão 1e-10). */
  readonly tolerancia?: number;
  readonly maxIteracoes?: number;
}

export function exigirTaxa(taxa: number, nome = "a taxa"): number {
  if (!Number.isFinite(taxa) || taxa <= -1) {
    throw new ErroParametroFinanceiro(`${nome} precisa ser um número maior que -100%`);
  }
  return taxa;
}

/** Taxa mensal equivalente a uma anual efetiva: (1 + a)^(1/12) − 1. */
/** Em fração (0,12 = 12%); a versão em % decimal é taxaMensalDeAnual, em indexadores. */
export function taxaMensalDeAnualFracao(anual: number): number {
  exigirTaxa(anual, "a taxa anual");
  return dec(1 + anual)
    .pow(dec(1).div(12))
    .minus(1)
    .toNumber();
}

/** Taxa anual efetiva equivalente a uma mensal: (1 + m)^12 − 1. */
export function taxaAnualDeMensalFracao(mensal: number): number {
  exigirTaxa(mensal, "a taxa mensal");
  return dec(1 + mensal)
    .pow(12)
    .minus(1)
    .toNumber();
}

function exigirFluxos(fluxos: readonly unknown[]): void {
  if (fluxos.length === 0) throw new ErroParametroFinanceiro("informe pelo menos um fluxo de caixa");
}

/** Valor presente líquido de fluxos periódicos a `taxa` por período. */
export function vpl(taxa: number, fluxos: readonly Valor[]): Valor {
  exigirFluxos(fluxos);
  const umMaisTaxa = dec(1 + exigirTaxa(taxa));
  let fator = dec(1);
  let soma = dec(0);
  for (const f of fluxos) {
    soma = soma.plus(f.times(fator));
    fator = fator.div(umMaisTaxa);
  }
  return soma;
}

const sinal = (v: number): number => (v === 0 ? 0 : v < 0 ? -1 : 1);

/**
 * Raiz de `f` entre `a` e `b` por bisseção, recursiva: cada chamada corta o intervalo
 * ao meio e desce para a metade em que o sinal troca. Só o sinal de `f` importa. Devolve null se as pontas têm o
 * mesmo sinal (não há garantia de raiz). Com o limite de iterações, devolve o meio do
 * último intervalo: a melhor aproximação até ali.
 */
export function raizPorBissecao(
  f: (x: number) => number,
  a: number,
  b: number,
  tolerancia: number,
  maxIteracoes: number,
): number | null {
  const sa = sinal(f(a));
  if (sa === 0) return a;
  const sb = sinal(f(b));
  if (sb === 0) return b;
  if (sa === sb) return null;
  return bissectar(f, a, b, sa, tolerancia, maxIteracoes);
}

function bissectar(
  f: (x: number) => number,
  a: number,
  b: number,
  sinalA: number,
  tolerancia: number,
  restantes: number,
): number {
  const meio = (a + b) / 2;
  if (b - a <= tolerancia || restantes <= 0) return meio;
  const sm = sinal(f(meio));
  if (sm === 0) return meio;
  return sm === sinalA
    ? bissectar(f, meio, b, sinalA, tolerancia, restantes - 1)
    : bissectar(f, a, meio, sinalA, tolerancia, restantes - 1);
}

function lerOpcoes(opcoes: OpcoesTir): { tolerancia: number; maxIteracoes: number } {
  const tolerancia = opcoes.tolerancia ?? TOLERANCIA_PADRAO;
  const maxIteracoes = opcoes.maxIteracoes ?? ITERACOES_PADRAO;
  if (!(tolerancia > 0) || !Number.isFinite(tolerancia)) {
    throw new ErroParametroFinanceiro("a tolerância da TIR precisa ser um número positivo");
  }
  if (!Number.isInteger(maxIteracoes) || maxIteracoes < 1) {
    throw new ErroParametroFinanceiro("o limite de iterações da TIR precisa ser um inteiro positivo");
  }
  return { tolerancia, maxIteracoes };
}

/**
 * Procura a taxa entre -99% e 1, ampliando o teto (dobra) até achar troca de sinal
 * ou passar de TAXA_MAXIMA. Com mais de uma troca de sinal nos fluxos pode haver
 * mais de uma TIR: devolve a primeira que a busca encontra.
 */
function buscarTaxa(f: (x: number) => number, opcoes: OpcoesTir): number | null {
  const { tolerancia, maxIteracoes } = lerOpcoes(opcoes);
  for (let teto = 1; teto <= TAXA_MAXIMA; teto *= 2) {
    const raiz = raizPorBissecao(f, TAXA_MINIMA, teto, tolerancia, maxIteracoes);
    if (raiz !== null) return raiz;
  }
  return null;
}

/** Taxa interna de retorno por período (a taxa que zera o VPL). null se não existir. */
export function tir(fluxos: readonly Valor[], opcoes: OpcoesTir = {}): number | null {
  exigirFluxos(fluxos);
  const temSaida = fluxos.some((f) => f.isNegative());
  const temEntrada = fluxos.some((f) => f.isPositive() && !f.isZero());
  if (!temSaida || !temEntrada) return null;
  const numeros = fluxos.map((f) => f.toNumber());
  return buscarTaxa((x) => vplNumerico(x, numeros), opcoes);
}

/**
 * A busca da taxa avalia o VPL em ponto flutuante: só o sinal importa, e o erro
 * (~1e-16 relativo) é desprezível perto da tolerância. Com Decimal, uma TIR de 360
 * parcelas levava quase um segundo; o dinheiro em si continua exato em vpl().
 */
function vplNumerico(taxa: number, fluxos: readonly number[]): number {
  const inverso = 1 / (1 + taxa);
  let fator = 1;
  let soma = 0;
  for (const f of fluxos) {
    soma += f * fator;
    fator *= inverso;
  }
  return soma;
}

function vplDatadoNumerico(taxaAnual: number, fluxos: readonly { anos: number; valor: number }[]): number {
  return fluxos.reduce((soma, f) => soma + f.valor / Math.pow(1 + taxaAnual, f.anos), 0);
}

const anosEntre = (de: number, ate: number): number => (ate - de) / MS_POR_DIA / DIAS_POR_ANO;

/** Fator (1 + taxa)^anos. O expoente fracionário vai em ponto flutuante; o dinheiro, não. */
const fatorComposto = (taxa: number, anos: number): Valor => dec(Math.pow(1 + taxa, anos));

/**
 * VPL de fluxos com data (como o XNPV): cada fluxo é descontado pela taxa anual
 * efetiva por (dias / 365) anos, até a data do primeiro fluxo.
 */
export function vplDatado(taxaAnual: number, fluxos: readonly FluxoDatado[]): Valor {
  exigirFluxos(fluxos);
  exigirTaxa(taxaAnual, "a taxa anual");
  const inicio = Math.min(...fluxos.map((f) => f.data));
  return fluxos.reduce(
    (soma, f) => soma.plus(f.valor.div(fatorComposto(taxaAnual, anosEntre(inicio, f.data)))),
    dec(0),
  );
}

/** TIR anual de fluxos com data (como o XIRR). null sem troca de sinal ou sem intervalo de tempo. */
export function tirDatada(fluxos: readonly FluxoDatado[], opcoes: OpcoesTir = {}): number | null {
  if (fluxos.length < 2) return null;
  const datas = fluxos.map((f) => f.data);
  if (Math.min(...datas) === Math.max(...datas)) return null;
  const temSaida = fluxos.some((f) => f.valor.isNegative());
  const temEntrada = fluxos.some((f) => f.valor.isPositive() && !f.valor.isZero());
  if (!temSaida || !temEntrada) return null;
  const inicio = Math.min(...datas);
  const numeros = fluxos.map((f) => ({ anos: anosEntre(inicio, f.data), valor: f.valor.toNumber() }));
  return buscarTaxa((x) => vplDatadoNumerico(x, numeros), opcoes);
}

/**
 * Quanto os fluxos valeriam em `dataBase` se cada um rendesse `taxaAnual` desde a sua
 * data (aportes positivos, retiradas negativas). É a conta do "e se fosse no CDI?".
 */
export function valorFuturoDatado(
  taxaAnual: number,
  fluxos: readonly FluxoDatado[],
  dataBase: number,
): Valor {
  exigirTaxa(taxaAnual, "a taxa anual");
  return fluxos.reduce(
    (soma, f) => soma.plus(f.valor.times(fatorComposto(taxaAnual, anosEntre(f.data, dataBase)))),
    dec(0),
  );
}

/** Período (fracionário, interpolado no período da virada) em que o acumulado deixa de ser negativo. */
function periodoDeRecuperacao(fluxos: readonly Valor[]): number | null {
  exigirFluxos(fluxos);
  let acumulado = dec(0);
  for (let i = 0; i < fluxos.length; i++) {
    const f = fluxos[i] as Valor;
    const anterior = acumulado;
    acumulado = acumulado.plus(f);
    if (acumulado.isNegative()) continue;
    if (i === 0 || !anterior.isNegative()) return i === 0 ? 0 : i;
    return i - 1 + anterior.neg().div(f).toNumber();
  }
  return null;
}

/** Payback simples: em quantos períodos o dinheiro investido volta, sem descontar o tempo. */
export function payback(fluxos: readonly Valor[]): number | null {
  return periodoDeRecuperacao(fluxos);
}

/** Payback descontado: o mesmo, com cada fluxo trazido a valor presente pela `taxa`. */
export function paybackDescontado(taxa: number, fluxos: readonly Valor[]): number | null {
  exigirFluxos(fluxos);
  const umMaisTaxa = dec(1 + exigirTaxa(taxa));
  let fator = dec(1);
  const descontados = fluxos.map((f) => {
    const v = f.times(fator);
    fator = fator.div(umMaisTaxa);
    return v;
  });
  return periodoDeRecuperacao(descontados);
}
