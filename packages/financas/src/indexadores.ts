import { dec, type Valor } from "@zentrade/dominio";
import {
  diaParaNumero,
  diasCorridos,
  listarDiasUteis,
  mesDe,
  somarMeses,
  type Dia,
  type Mes,
} from "./calendario.js";

/**
 * Índices de referência e as contas de fator. As séries vêm do Banco Central
 * (SGS) e chegam aqui prontas, como mapas dia → taxa. Regra de ouro: sem dado,
 * não há conta. Um buraco no meio da série vira erro com a lista do que falta;
 * só o fim do período (taxa de hoje, ainda não publicada) pode ficar de fora, e
 * a resposta diz até que dia a conta foi.
 */

export interface FonteIndice {
  readonly serie: number;
  readonly nome: string;
  readonly unidade: string;
}

const sgs = (serie: number, nome: string, unidade: string): FonteIndice => ({ serie, nome, unidade });

export const FONTES_INDICES = {
  CDI: sgs(12, "CDI (taxa DI) diária", "% ao dia"),
  SELIC: sgs(11, "Selic diária (taxa efetiva)", "% ao dia"),
  SELIC_META: sgs(432, "Meta Selic definida pelo Copom", "% ao ano"),
  IPCA: sgs(433, "IPCA, variação mensal", "% no mês"),
  POUPANCA: sgs(
    195,
    "Rentabilidade da poupança (depósitos desde 04/05/2012), por data de aniversário",
    "% no período",
  ),
  TR: sgs(226, "TR, por data de início do período", "% no período"),
} as const;

export const FONTE_BCB = "Banco Central do Brasil, Sistema Gerenciador de Séries Temporais (SGS)";

export type NomeIndice = keyof typeof FONTES_INDICES;

const ROTULO_INDICE: Readonly<Record<NomeIndice, string>> = {
  CDI: "CDI",
  SELIC: "Selic",
  SELIC_META: "meta Selic",
  IPCA: "IPCA",
  POUPANCA: "poupança",
  TR: "TR",
};

export class ErroIndiceFaltando extends Error {
  override name = "ErroIndiceFaltando";
  constructor(
    readonly indice: NomeIndice,
    readonly faltando: readonly string[],
  ) {
    const lista =
      faltando.slice(0, 6).join(", ") + (faltando.length > 6 ? ` e mais ${faltando.length - 6}` : "");
    super(`faltam dados do ${ROTULO_INDICE[indice]} (${FONTES_INDICES[indice].nome}) para: ${lista}`);
  }
}

const UM = dec(1);
const CEM = dec(100);
const TRUNCAR = 1; // Decimal.ROUND_DOWN

/** (1 + d)^252 − 1, em %. */
export const taxaAnualDeDiaria = (diariaPct: Valor): Valor =>
  UM.plus(diariaPct.div(CEM)).pow(252).minus(1).times(CEM);
/** (1 + a)^(1/252) − 1, em %. */
export const taxaDiariaDeAnual = (anualPct: Valor): Valor =>
  UM.plus(anualPct.div(CEM)).pow(UM.div(252)).minus(1).times(CEM);
export const taxaMensalDeAnual = (anualPct: Valor): Valor =>
  UM.plus(anualPct.div(CEM)).pow(UM.div(12)).minus(1).times(CEM);
export const taxaAnualDeMensal = (mensalPct: Valor): Valor =>
  UM.plus(mensalPct.div(CEM)).pow(12).minus(1).times(CEM);

/** (1 + taxa)^(du/252): prefixado, taxa real do IPCA+ e spread sobre a Selic. */
export const fatorPrefixado = (taxaAnualPct: Valor, diasUteis: number): Valor =>
  UM.plus(taxaAnualPct.div(CEM)).pow(dec(diasUteis).div(252));

export interface FatorDiario {
  readonly fator: Valor;
  readonly diasUteis: number;
  /** Fim (exclusivo) do período que a conta cobriu. Menor que o pedido quando `parcial`. */
  readonly ate: Dia;
  /** As últimas taxas ainda não foram publicadas: a conta parou antes. */
  readonly parcial: boolean;
}

/**
 * Π (1 + taxa_dia × percentual) nos dias úteis de [de, ate), com o fator de cada dia
 * truncado em 16 casas (como a B3 faz com o DI). `serie` em % ao dia; `percentualPct`
 * é o percentual do índice (110 = 110% do CDI).
 */
export function fatorDiario(
  serie: ReadonlyMap<Dia, Valor>,
  indice: NomeIndice,
  de: Dia,
  ate: Dia,
  percentualPct: Valor = CEM,
): FatorDiario {
  const dias = listarDiasUteis(de, ate);
  const ultimoComDado = dias.findLastIndex((d) => serie.has(d));
  const buracos = dias.slice(0, ultimoComDado + 1).filter((d) => !serie.has(d));
  if (buracos.length > 0 || (ultimoComDado < 0 && dias.length > 0)) {
    throw new ErroIndiceFaltando(indice, buracos.length > 0 ? buracos : dias);
  }
  const usados = dias.slice(0, ultimoComDado + 1);
  const multiplicador = percentualPct.div(CEM);
  let fator = UM;
  for (const d of usados) {
    const doDia = UM.plus((serie.get(d) as Valor).div(CEM).times(multiplicador)).toDecimalPlaces(16, TRUNCAR);
    fator = fator.times(doDia).toDecimalPlaces(16, TRUNCAR);
  }
  const parcial = usados.length < dias.length;
  return { fator, diasUteis: usados.length, ate: parcial ? (dias[usados.length] as Dia) : ate, parcial };
}

export interface FatorIpca {
  readonly fator: Valor;
  /** Meses sem IPCA publicado que entraram pela projeção informada. */
  readonly mesesProjetados: readonly Mes[];
}

const diasNoMes = (mes: Mes): number => diasCorridos(`${mes}-01`, somarMeses(`${mes}-01`, 1));

/** Pedaços de [de, ate) por mês: cada um com a fração de dias corridos do mês. */
function fatiasPorMes(de: Dia, ate: Dia): { mes: Mes; fracao: Valor }[] {
  const fatias: { mes: Mes; fracao: Valor }[] = [];
  for (let inicio = de; diaParaNumero(inicio) < diaParaNumero(ate);) {
    const mes = mesDe(inicio);
    const proximoMes = somarMeses(`${mes}-01`, 1);
    const fim = diaParaNumero(proximoMes) < diaParaNumero(ate) ? proximoMes : ate;
    fatias.push({ mes, fracao: dec(diasCorridos(inicio, fim)).div(diasNoMes(mes)) });
    inicio = fim;
  }
  return fatias;
}

/**
 * Inflação acumulada em [de, ate): IPCA mensal (em %) com pro rata por dias corridos
 * nos meses quebrados. Mês sem IPCA publicado usa `projecaoAnualPct` (se informada).
 */
export function fatorIpca(
  serieMensal: ReadonlyMap<Mes, Valor>,
  de: Dia,
  ate: Dia,
  projecaoAnualPct?: Valor,
): FatorIpca {
  const fatias = fatiasPorMes(de, ate);
  const faltando = fatias.filter((f) => !serieMensal.has(f.mes)).map((f) => f.mes);
  if (faltando.length > 0 && projecaoAnualPct === undefined) throw new ErroIndiceFaltando("IPCA", faltando);
  const projetadaMensal =
    projecaoAnualPct === undefined ? UM : UM.plus(taxaMensalDeAnual(projecaoAnualPct).div(CEM));
  let fator = UM;
  for (const { mes, fracao } of fatias) {
    const variacao = serieMensal.get(mes);
    const doMes = variacao === undefined ? projetadaMensal : UM.plus(variacao.div(CEM));
    fator = fator.times(doMes.pow(fracao));
  }
  return { fator, mesesProjetados: faltando };
}

/** Depósitos nos dias 29, 30 e 31 fazem aniversário no dia 1º do mês seguinte. */
export function aniversarioPoupanca(deposito: Dia): Dia {
  const dia = Number(deposito.slice(8, 10));
  return dia >= 29 ? somarMeses(`${mesDe(deposito)}-01`, 1) : deposito;
}

/**
 * Remuneração da poupança num mês, em %, pela regra em vigor desde 04/05/2012
 * (Lei 8.177/1991, art. 12, II, com a redação da Lei 12.703/2012): com a meta Selic
 * acima de 8,5% ao ano, 0,5% ao mês; senão, 70% da meta, mensalizada. Mais a TR.
 */
export function remuneracaoPoupancaMensal(metaSelicAnualPct: Valor, trMensalPct: Valor): Valor {
  const adicional = metaSelicAnualPct.gt("8.5")
    ? dec("0.5")
    : taxaMensalDeAnual(metaSelicAnualPct.times("0.7"));
  return UM.plus(adicional.div(CEM))
    .times(UM.plus(trMensalPct.div(CEM)))
    .minus(1)
    .times(CEM);
}

export interface FatorPoupanca {
  readonly fator: Valor;
  readonly periodos: number;
  /** Último aniversário completo (a data em que a poupança creditou pela última vez). */
  readonly ultimoAniversario: Dia;
}

/**
 * A poupança só credita no aniversário. `serie`: rentabilidade (em %) de cada
 * período, pela data de início (SGS 195). Conta os períodos completos até `ate`.
 */
export function fatorPoupanca(serie: ReadonlyMap<Dia, Valor>, deposito: Dia, ate: Dia): FatorPoupanca {
  const base = aniversarioPoupanca(deposito);
  const limite = diaParaNumero(ate);
  const inicios: Dia[] = [];
  for (let k = 0; diaParaNumero(somarMeses(base, k + 1)) <= limite; k++) inicios.push(somarMeses(base, k));
  const faltando = inicios.filter((d) => !serie.has(d));
  if (faltando.length > 0) throw new ErroIndiceFaltando("POUPANCA", faltando);
  const fator = inicios.reduce((f, d) => f.times(UM.plus((serie.get(d) as Valor).div(CEM))), UM);
  return { fator, periodos: inicios.length, ultimoAniversario: somarMeses(base, inicios.length) };
}
