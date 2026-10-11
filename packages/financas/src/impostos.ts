import { dec, type Valor } from "@zentrade/dominio";
import type { Dia } from "./calendario.js";
import type { TipoTitulo } from "./renda-fixa-tipos.js";

/**
 * Impostos da renda fixa para pessoa física, com a fonte e a data em que cada
 * tabela foi conferida. As tabelas são dados, não código: quem chama pode passar
 * outras (uma lei nova, uma simulação) sem mexer nas contas.
 *
 * Conferido em 2026-10-11:
 * - IR: Lei 11.033/2004, art. 1º, ainda com a redação original. A MP 1.303/2025
 *   (alíquota única de 17,5% e 5% sobre LCI/LCA/CRI/CRA novas a partir de 2026)
 *   perdeu a vigência em 08/10/2025 sem virar lei (Ato Declaratório do Presidente
 *   da Mesa do Congresso Nacional nº 67/2025). Nada mudou nas alíquotas.
 * - IOF: Decreto 6.306/2007, art. 32, § 2º, e Anexo.
 * - Isenções: Lei 11.033/2004, art. 3º, II e IV (LCI, CRI, LCA, CRA); Lei 12.431/2011,
 *   art. 2º (debêntures incentivadas, alíquota zero para pessoa física); Lei
 *   8.981/1995, art. 68, III (poupança).
 */

export interface FaixaIr {
  /** Até quantos dias corridos (inclusive) vale a alíquota; `null` = acima da faixa anterior. */
  readonly ateDias: number | null;
  /** Fração do rendimento (0.225 = 22,5%). */
  readonly aliquota: Valor;
}

export interface TabelaIr {
  readonly vigenteDesde: Dia;
  readonly fonte: string;
  readonly faixas: readonly FaixaIr[];
}

export interface TabelaIof {
  readonly fonte: string;
  /** Percentual do rendimento retido por dia corrido: índice 0 = 1 dia … índice 28 = 29 dias. */
  readonly percentuais: readonly number[];
}

export interface Isencao {
  readonly isentoIr: boolean;
  readonly isentoIof: boolean;
  readonly base: string;
}

export interface RegrasTributarias {
  readonly verificadoEm: Dia;
  readonly ir: TabelaIr;
  readonly iof: TabelaIof;
  readonly isencoes: Readonly<Record<TipoTitulo, Isencao>>;
  readonly notas: readonly string[];
}

export const IR_RENDA_FIXA: TabelaIr = {
  vigenteDesde: "2005-01-01",
  fonte: "Lei 11.033/2004, art. 1º (IR retido na fonte, alíquotas regressivas)",
  faixas: [
    { ateDias: 180, aliquota: dec("0.225") },
    { ateDias: 360, aliquota: dec("0.2") },
    { ateDias: 720, aliquota: dec("0.175") },
    { ateDias: null, aliquota: dec("0.15") },
  ],
};

export const IOF_REGRESSIVO: TabelaIof = {
  fonte: "Decreto 6.306/2007, art. 32, § 2º, e Anexo (IOF sobre resgate antes de 30 dias)",
  percentuais: [
    96, 93, 90, 86, 83, 80, 76, 73, 70, 66, 63, 60, 56, 53, 50, 46, 43, 40, 36, 33, 30, 26, 23, 20, 16, 13,
    10, 6, 3,
  ],
};

const tributado: Isencao = { isentoIr: false, isentoIof: false, base: "Lei 11.033/2004, art. 1º" };
const isentoIrPorLei = (base: string): Isencao => ({ isentoIr: true, isentoIof: false, base });

export const ISENCOES_PESSOA_FISICA: Readonly<Record<TipoTitulo, Isencao>> = {
  CDB: tributado,
  LC: tributado,
  CAIXINHA: tributado,
  DEBENTURE: tributado,
  TESOURO_SELIC: tributado,
  TESOURO_PREFIXADO: tributado,
  TESOURO_IPCA: tributado,
  OUTRO: tributado,
  LCI: isentoIrPorLei("Lei 11.033/2004, art. 3º, II"),
  CRI: isentoIrPorLei("Lei 11.033/2004, art. 3º, II"),
  LCA: isentoIrPorLei("Lei 11.033/2004, art. 3º, IV"),
  CRA: isentoIrPorLei("Lei 11.033/2004, art. 3º, IV"),
  DEBENTURE_INCENTIVADA: isentoIrPorLei("Lei 12.431/2011, art. 2º (alíquota zero para pessoa física)"),
  POUPANCA: { isentoIr: true, isentoIof: true, base: "Lei 8.981/1995, art. 68, III" },
};

export const REGRAS_TRIBUTARIAS_VIGENTES: RegrasTributarias = {
  verificadoEm: "2026-10-11",
  ir: IR_RENDA_FIXA,
  iof: IOF_REGRESSIVO,
  isencoes: ISENCOES_PESSOA_FISICA,
  notas: [
    "A MP 1.303/2025 (alíquota única de 17,5% e IR de 5% para LCI, LCA, CRI e CRA emitidas a partir de 2026) perdeu a vigência em 08/10/2025 sem ser votada (Ato Declaratório do Presidente da Mesa do Congresso Nacional nº 67/2025). Valem a tabela regressiva e as isenções de sempre.",
    "A Lei 15.270/2025 criou a tributação mínima do IRPF para quem recebe mais de R$ 600 mil por ano (a partir do ano-calendário 2026), apurada na declaração anual. Ela não muda o IR retido em cada título e não é estimada aqui.",
    "Valores são estimativas: a instituição pode arredondar de outro jeito e, no Tesouro Direto, o preço de mercado e a taxa de custódia mudam o líquido.",
  ],
};

const ARREDONDAR_METADE_PARA_CIMA = 4; // Decimal.ROUND_HALF_UP
const centavos = (v: Valor): Valor => v.toDecimalPlaces(2, ARREDONDAR_METADE_PARA_CIMA);

function exigirDias(dias: number): void {
  if (!Number.isInteger(dias) || dias < 0) throw new RangeError(`dias corridos inválidos: ${dias}`);
}

export function aliquotaIr(diasCorridos: number, tabela: TabelaIr = IR_RENDA_FIXA): Valor {
  exigirDias(diasCorridos);
  const faixa = tabela.faixas.find((f) => f.ateDias === null || diasCorridos <= f.ateDias);
  if (!faixa)
    throw new RangeError("a tabela de IR não cobre esse prazo; a última faixa precisa ter ateDias null");
  return faixa.aliquota;
}

export function aliquotaIof(diasCorridos: number, tabela: TabelaIof = IOF_REGRESSIVO): Valor {
  exigirDias(diasCorridos);
  const percentual = tabela.percentuais[Math.max(diasCorridos, 1) - 1] ?? 0;
  return dec(percentual).div(100);
}

export const isentoDeIr = (
  tipo: TipoTitulo,
  regras: RegrasTributarias = REGRAS_TRIBUTARIAS_VIGENTES,
): boolean => regras.isencoes[tipo].isentoIr;

export interface EntradaImpostos {
  readonly tipo: TipoTitulo;
  readonly aplicado: Valor;
  readonly bruto: Valor;
  /** Dias corridos entre a aplicação e o resgate (ou a data da conta). */
  readonly diasCorridos: number;
}

export interface Impostos {
  readonly rendimento: Valor;
  readonly iof: Valor;
  readonly ir: Valor;
  readonly liquido: Valor;
  readonly aliquotaIr: Valor;
  readonly aliquotaIof: Valor;
  readonly isentoIr: boolean;
}

/** IOF primeiro, sobre o rendimento; o IR incide sobre o rendimento menos o IOF. */
export function estimarImpostos(
  e: EntradaImpostos,
  regras: RegrasTributarias = REGRAS_TRIBUTARIAS_VIGENTES,
): Impostos {
  const isencao = regras.isencoes[e.tipo];
  const taxaIof = isencao.isentoIof ? dec(0) : aliquotaIof(e.diasCorridos, regras.iof);
  const taxaIr = isencao.isentoIr ? dec(0) : aliquotaIr(e.diasCorridos, regras.ir);
  const rendimento = e.bruto.minus(e.aplicado);
  if (rendimento.lte(0)) {
    return {
      rendimento,
      iof: dec(0),
      ir: dec(0),
      liquido: e.bruto,
      aliquotaIr: taxaIr,
      aliquotaIof: taxaIof,
      isentoIr: isencao.isentoIr,
    };
  }
  const iof = centavos(rendimento.times(taxaIof));
  const ir = centavos(rendimento.minus(iof).times(taxaIr));
  return {
    rendimento,
    iof,
    ir,
    liquido: e.bruto.minus(iof).minus(ir),
    aliquotaIr: taxaIr,
    aliquotaIof: taxaIof,
    isentoIr: isencao.isentoIr,
  };
}
