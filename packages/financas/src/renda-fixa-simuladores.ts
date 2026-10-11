import { dec, type Valor } from "@zentrade/dominio";
import { diaParaNumero, diasCorridos, diasUteis, somarDias, somarMeses, type Dia } from "./calendario.js";
import {
  aliquotaIr,
  estimarImpostos,
  REGRAS_TRIBUTARIAS_VIGENTES,
  type RegrasTributarias,
} from "./impostos.js";
import { fatorPrefixado, remuneracaoPoupancaMensal, taxaDiariaDeAnual } from "./indexadores.js";
import type { TipoTitulo } from "./renda-fixa-tipos.js";

/**
 * Simuladores: comparam alternativas com premissas que a pessoa escolhe. Mostram
 * contas, não recomendam nada; cada resultado traz as premissas por extenso.
 */

const UM = dec(1);
const CEM = dec(100);
const TRUNCAR = 1; // Decimal.ROUND_DOWN
const pct = (v: Valor, casas = 2): string => v.toDecimalPlaces(casas).toFixed().replace(".", ",");

function exigirPrazo(prazoDias: number): void {
  if (!Number.isInteger(prazoDias) || prazoDias < 1 || prazoDias > 365 * 40) {
    throw new RangeError("o prazo precisa ser um número inteiro de dias entre 1 e 14.600");
  }
}

// ---------- LCI/LCA × CDB ----------

export interface EntradaEquivalencia {
  readonly direcao: "isento_para_tributado" | "tributado_para_isento";
  /** % do CDI do título conhecido. */
  readonly percentualCdi: Valor;
  readonly prazoDias: number;
  /** Premissa de CDI, % ao ano. */
  readonly cdiAnual: Valor;
  readonly inicio: Dia;
  readonly regras?: RegrasTributarias;
}

export interface Equivalencia {
  readonly aliquotaIr: Valor;
  /** % do CDI equivalente com juros compostos (rendimento líquido igual). */
  readonly equivalente: Valor;
  /** A conta de bolso: isento ÷ (1 − IR), ou tributado × (1 − IR). */
  readonly regraDeBolso: Valor;
  readonly curva: readonly {
    readonly prazoDias: number;
    readonly equivalente: Valor;
    readonly aliquotaIr: Valor;
  }[];
  readonly premissas: readonly string[];
}

const PRAZOS_CURVA = [30, 90, 180, 181, 360, 361, 540, 720, 721, 1080, 1800] as const;

/** Resolve (1 + d·p)^du = alvo para p, em % do CDI. */
const percentualPara = (alvo: Valor, diaria: Valor, du: number): Valor =>
  alvo.pow(UM.div(du)).minus(1).div(diaria).times(CEM);

function equivalenteNoPrazo(
  e: EntradaEquivalencia,
  prazoDias: number,
): { equivalente: Valor; aliquota: Valor } {
  const regras = e.regras ?? REGRAS_TRIBUTARIAS_VIGENTES;
  const aliquota = aliquotaIr(prazoDias, regras.ir);
  const du = Math.max(diasUteis(e.inicio, somarDias(e.inicio, prazoDias)), 1);
  const diaria = taxaDiariaDeAnual(e.cdiAnual).div(CEM);
  const rendimento = UM.plus(diaria.times(e.percentualCdi.div(CEM)))
    .pow(du)
    .minus(1);
  const alvo =
    e.direcao === "isento_para_tributado"
      ? UM.plus(rendimento.div(UM.minus(aliquota)))
      : UM.plus(rendimento.times(UM.minus(aliquota)));
  return { equivalente: percentualPara(alvo, diaria, du), aliquota };
}

export function equivalenciaIsento(e: EntradaEquivalencia): Equivalencia {
  exigirPrazo(e.prazoDias);
  const { equivalente, aliquota } = equivalenteNoPrazo(e, e.prazoDias);
  const regraDeBolso =
    e.direcao === "isento_para_tributado"
      ? e.percentualCdi.div(UM.minus(aliquota))
      : e.percentualCdi.times(UM.minus(aliquota));
  const curva = PRAZOS_CURVA.map((prazoDias) => {
    const r = equivalenteNoPrazo(e, prazoDias);
    return { prazoDias, equivalente: r.equivalente, aliquotaIr: r.aliquota };
  });
  return {
    aliquotaIr: aliquota,
    equivalente,
    regraDeBolso,
    curva,
    premissas: [
      `CDI de ${pct(e.cdiAnual)}% ao ano durante todo o prazo.`,
      `IR de ${pct(aliquota.times(CEM), 1)}% para ${e.prazoDias} dias (tabela regressiva); LCI e LCA isentas para pessoa física.`,
      "Resgate só no vencimento (sem IOF). Risco de crédito, liquidez e garantia do FGC não entram na conta.",
    ],
  };
}

// ---------- Tesouro Selic × CDB × poupança ----------

export interface EntradaSelicCdbPoupanca {
  readonly valor: Valor;
  readonly inicio: Dia;
  readonly prazoDias: number;
  /** Selic efetiva esperada, % ao ano (o Tesouro Selic rende isso + o spread). */
  readonly selicAnual: Valor;
  readonly cdiAnual: Valor;
  readonly percentualCdb: Valor;
  /** Meta Selic, % ao ano (decide a regra da poupança). */
  readonly metaSelicAnual: Valor;
  /** TR esperada, % ao mês. */
  readonly trMensal: Valor;
  readonly spreadSelicAnual?: Valor;
  readonly custodiaAnualPct?: Valor;
  readonly isencaoCustodiaSelic?: Valor;
  readonly regras?: RegrasTributarias;
}

export interface ResultadoAlternativa {
  readonly bruto: Valor;
  readonly iof: Valor;
  readonly ir: Valor;
  readonly custodia: Valor;
  readonly liquido: Valor;
  readonly aliquotaIr: Valor;
  readonly rentabilidadeLiquidaPct: Valor;
}

export interface PontoComparacao {
  readonly dia: Dia;
  readonly tesouroSelic: Valor;
  readonly cdb: Valor;
  readonly poupanca: Valor;
}

export interface ComparacaoSelicCdbPoupanca {
  readonly tesouroSelic: ResultadoAlternativa;
  readonly cdb: ResultadoAlternativa;
  readonly poupanca: ResultadoAlternativa;
  readonly serie: readonly PontoComparacao[];
  readonly premissas: readonly string[];
}

const CUSTODIA_B3 = dec("0.2");
const ISENCAO_CUSTODIA_SELIC = dec(10000);

function resultado(
  tipo: TipoTitulo,
  valor: Valor,
  bruto: Valor,
  dias: number,
  custodia: Valor,
  regras: RegrasTributarias,
): ResultadoAlternativa {
  // A taxa de custódia cobrada no resgate sai da base do IR.
  const imp = estimarImpostos(
    { tipo, aplicado: valor, bruto: bruto.minus(custodia), diasCorridos: dias },
    regras,
  );
  return {
    bruto,
    iof: imp.iof,
    ir: imp.ir,
    custodia,
    liquido: imp.liquido,
    aliquotaIr: imp.aliquotaIr,
    rentabilidadeLiquidaPct: imp.liquido.minus(valor).div(valor).times(CEM),
  };
}

function aniversariosAte(inicio: Dia, fim: Dia): number {
  let n = 0;
  while (diaParaNumero(somarMeses(inicio, n + 1)) <= diaParaNumero(fim)) n++;
  return n;
}

function brutosEm(e: EntradaSelicCdbPoupanca, dia: Dia) {
  const du = diasUteis(e.inicio, dia);
  const selic = UM.plus(taxaDiariaDeAnual(e.selicAnual).div(CEM))
    .pow(du)
    .times(fatorPrefixado(e.spreadSelicAnual ?? dec(0), du));
  const cdb = UM.plus(taxaDiariaDeAnual(e.cdiAnual).div(CEM).times(e.percentualCdb.div(CEM))).pow(du);
  const mensal = remuneracaoPoupancaMensal(e.metaSelicAnual, e.trMensal);
  const poupanca = UM.plus(mensal.div(CEM)).pow(aniversariosAte(e.inicio, dia));
  const v = (f: Valor): Valor => e.valor.times(f).toDecimalPlaces(2, TRUNCAR);
  return { tesouroSelic: v(selic), cdb: v(cdb), poupanca: v(poupanca), mensalPoupanca: mensal };
}

/** Custódia da B3 pro rata pelo valor médio do período, só sobre o que passa da isenção. */
function custodiaSelic(e: EntradaSelicCdbPoupanca, bruto: Valor, dias: number): Valor {
  const medio = e.valor.plus(bruto).div(2);
  const excedente = medio.minus(e.isencaoCustodiaSelic ?? ISENCAO_CUSTODIA_SELIC);
  if (excedente.lte(0)) return dec(0);
  return excedente
    .times((e.custodiaAnualPct ?? CUSTODIA_B3).div(CEM))
    .times(dias)
    .div(365)
    .toDecimalPlaces(2);
}

export function compararSelicCdbPoupanca(e: EntradaSelicCdbPoupanca): ComparacaoSelicCdbPoupanca {
  exigirPrazo(e.prazoDias);
  const regras = e.regras ?? REGRAS_TRIBUTARIAS_VIGENTES;
  const fim = somarDias(e.inicio, e.prazoDias);
  const final = brutosEm(e, fim);
  const serie: PontoComparacao[] = [];
  for (let k = 0; diaParaNumero(somarMeses(e.inicio, k)) < diaParaNumero(fim); k++) {
    const dia = somarMeses(e.inicio, k);
    const b = brutosEm(e, dia);
    serie.push({ dia, tesouroSelic: b.tesouroSelic, cdb: b.cdb, poupanca: b.poupanca });
  }
  serie.push({ dia: fim, tesouroSelic: final.tesouroSelic, cdb: final.cdb, poupanca: final.poupanca });
  return {
    tesouroSelic: resultado(
      "TESOURO_SELIC",
      e.valor,
      final.tesouroSelic,
      e.prazoDias,
      custodiaSelic(e, final.tesouroSelic, e.prazoDias),
      regras,
    ),
    cdb: resultado("CDB", e.valor, final.cdb, e.prazoDias, dec(0), regras),
    poupanca: resultado("POUPANCA", e.valor, final.poupanca, e.prazoDias, dec(0), regras),
    serie,
    premissas: [
      `Selic de ${pct(e.selicAnual)}% ao ano e CDI de ${pct(e.cdiAnual)}% ao ano durante todo o prazo; CDB a ${pct(e.percentualCdb)}% do CDI.`,
      `Poupança pela regra da Lei 12.703/2012 com meta Selic de ${pct(e.metaSelicAnual)}% e TR de ${pct(e.trMensal, 4)}% ao mês: ${pct(final.mensalPoupanca, 4)}% ao mês, só nos aniversários.`,
      `Tesouro Selic levado na curva, com taxa de custódia da B3 de ${(e.custodiaAnualPct ?? CUSTODIA_B3).toFixed(2).replace(".", ",")}% ao ano sobre o que passa de R$ 10 mil (regulamento do Tesouro Direto).`,
      "IR pela tabela regressiva; resgate no fim do prazo. Garantias (Tesouro Nacional, FGC) e liquidez não entram na conta.",
    ],
  };
}

// ---------- Prefixado × IPCA+ ----------

export interface EntradaPreIpca {
  readonly valor: Valor;
  readonly inicio: Dia;
  readonly prazoDias: number;
  /** % ao ano. */
  readonly taxaPre: Valor;
  /** Taxa real do IPCA+, % ao ano. */
  readonly taxaReal: Valor;
  /** Premissa de IPCA, % ao ano. */
  readonly ipcaEsperado: Valor;
  readonly regras?: RegrasTributarias;
}

export interface ComparacaoPreIpca {
  /** Inflação anual em que os dois terminam iguais. */
  readonly inflacaoEquilibrio: Valor;
  readonly prefixado: ResultadoAlternativa;
  readonly ipcaMais: ResultadoAlternativa;
  readonly curva: readonly { readonly ipca: Valor; readonly prefixado: Valor; readonly ipcaMais: Valor }[];
  readonly premissas: readonly string[];
}

export function preVersusIpca(e: EntradaPreIpca): ComparacaoPreIpca {
  exigirPrazo(e.prazoDias);
  const regras = e.regras ?? REGRAS_TRIBUTARIAS_VIGENTES;
  const du = diasUteis(e.inicio, somarDias(e.inicio, e.prazoDias));
  const dias = diasCorridos(e.inicio, somarDias(e.inicio, e.prazoDias));
  const brutoPre = e.valor.times(fatorPrefixado(e.taxaPre, du)).toDecimalPlaces(2, TRUNCAR);
  const brutoIpca = (ipca: Valor): Valor =>
    e.valor.times(fatorPrefixado(ipca, du)).times(fatorPrefixado(e.taxaReal, du)).toDecimalPlaces(2, TRUNCAR);
  const liquido = (bruto: Valor): Valor =>
    estimarImpostos({ tipo: "TESOURO_PREFIXADO", aplicado: e.valor, bruto, diasCorridos: dias }, regras)
      .liquido;
  const curva = Array.from({ length: 33 }, (_, i) => dec(i).div(2).minus(2)).map((ipca) => ({
    ipca,
    prefixado: liquido(brutoPre),
    ipcaMais: liquido(brutoIpca(ipca)),
  }));
  return {
    inflacaoEquilibrio: UM.plus(e.taxaPre.div(CEM))
      .div(UM.plus(e.taxaReal.div(CEM)))
      .minus(1)
      .times(CEM),
    prefixado: resultado("TESOURO_PREFIXADO", e.valor, brutoPre, dias, dec(0), regras),
    ipcaMais: resultado("TESOURO_IPCA", e.valor, brutoIpca(e.ipcaEsperado), dias, dec(0), regras),
    curva,
    premissas: [
      `Prefixado a ${pct(e.taxaPre)}% ao ano × IPCA + ${pct(e.taxaReal)}% ao ano, levados até o fim do prazo.`,
      `IPCA de ${pct(e.ipcaEsperado)}% ao ano em todo o prazo (o gráfico mostra outros cenários).`,
      "IR pela tabela regressiva; custódia e preço de mercado no meio do caminho não entram na conta.",
    ],
  };
}
