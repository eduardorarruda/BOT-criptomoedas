import { Decimal } from "decimal.js";
import { dec, type Valor } from "../dinheiro.js";

/**
 * ESTIMATIVA do imposto de renda do day trade, para o relatório do backtest. Não é
 * parecer tributário: a apuração de verdade é da pessoa (DARF 6015), com as notas de
 * corretagem. Regras usadas (nota 03 da base de conhecimento):
 *
 * - 20% sobre o resultado líquido POSITIVO do mês em day trade;
 * - prejuízo de day trade abate ganho de day trade dos meses seguintes, sem prazo
 *   (atravessa a virada do ano) e sem misturar com operações comuns;
 * - IRRF ("dedo-duro"): 1% do resultado líquido positivo de cada dia, retido na
 *   fonte. É antecipação do imposto (abate o DARF), não custo a mais: aparece só
 *   como informação.
 *
 * Valores em centavos (meio para cima). Não trata o DARF abaixo de R$ 10, que fica
 * para o mês seguinte.
 */
export const ALIQUOTA_IR_DAY_TRADE = 0.2;
export const ALIQUOTA_IRRF_DAY_TRADE = 0.01;

export interface ResultadoDoDia {
  /** "AAAA-MM-DD" (dia do pregão). */
  readonly dia: string;
  /** Resultado líquido de custos do dia, em reais. */
  readonly resultado: Valor;
}

export interface ApuracaoMensal {
  /** "AAAA-MM". */
  readonly mes: string;
  readonly resultado: Valor;
  /** Prejuízo acumulado de meses anteriores, antes deste mês. */
  readonly prejuizoAntes: Valor;
  /** Quanto desse prejuízo abateu o ganho deste mês. */
  readonly compensado: Valor;
  readonly base: Valor;
  readonly ir: Valor;
  /** IRRF de 1% dos dias positivos (informativo: abate o imposto). */
  readonly irrf: Valor;
  readonly prejuizoDepois: Valor;
}

export interface ApuracaoIr {
  readonly meses: readonly ApuracaoMensal[];
  readonly irTotal: Valor;
  readonly irrfTotal: Valor;
  /** Prejuízo que sobra para compensar depois do período. */
  readonly prejuizoACompensar: Valor;
}

const centavos = (v: Valor): Valor => v.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
const menor = (a: Valor, b: Valor): Valor => (a.lt(b) ? a : b);

/** Soma os resultados por dia e agrupa por mês, em ordem. */
function porMes(dias: readonly ResultadoDoDia[]): Map<string, Map<string, Valor>> {
  const meses = new Map<string, Map<string, Valor>>();
  for (const d of [...dias].sort((a, b) => a.dia.localeCompare(b.dia))) {
    const mes = d.dia.slice(0, 7);
    const doMes = meses.get(mes) ?? new Map<string, Valor>();
    doMes.set(d.dia, (doMes.get(d.dia) ?? dec(0)).plus(d.resultado));
    meses.set(mes, doMes);
  }
  return meses;
}

export function apurarIrDayTrade(dias: readonly ResultadoDoDia[]): ApuracaoIr {
  let prejuizo = dec(0);
  const meses: ApuracaoMensal[] = [];
  for (const [mes, doMes] of porMes(dias)) {
    const valores = [...doMes.values()];
    const resultado = valores.reduce((s, v) => s.plus(v), dec(0));
    const irrf = valores
      .filter((v) => v.gt(0))
      .reduce((s, v) => s.plus(centavos(v.times(ALIQUOTA_IRRF_DAY_TRADE))), dec(0));
    const prejuizoAntes = prejuizo;
    const compensado = resultado.gt(0) ? menor(prejuizo, resultado) : dec(0);
    const base = resultado.gt(0) ? resultado.minus(compensado) : dec(0);
    prejuizo = resultado.gt(0) ? prejuizo.minus(compensado) : prejuizo.plus(resultado.neg());
    meses.push({
      mes,
      resultado,
      prejuizoAntes,
      compensado,
      base,
      ir: centavos(base.times(ALIQUOTA_IR_DAY_TRADE)),
      irrf,
      prejuizoDepois: prejuizo,
    });
  }
  return {
    meses,
    irTotal: meses.reduce((s, m) => s.plus(m.ir), dec(0)),
    irrfTotal: meses.reduce((s, m) => s.plus(m.irrf), dec(0)),
    prejuizoACompensar: prejuizo,
  };
}
