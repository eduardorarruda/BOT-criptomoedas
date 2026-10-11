import type { LancamentoImobiliario } from "@zentrade/contratos/esquemas";
import { dec, type Valor } from "@zentrade/dominio";

/**
 * Séries para os gráficos, a partir de textos decimais. A soma é em Decimal; só o
 * valor final vira `number`, para desenhar (o texto exato fica na tabela).
 */
interface LinhaTabela {
  readonly mes: number;
  readonly juros: string;
  readonly amortizacao: string;
  readonly parcelaTotal: string;
  readonly saldoFinal: string;
}

export interface AnoFinanciamento {
  readonly ano: number;
  readonly juros: number;
  readonly amortizacao: number;
  readonly pago: number;
  readonly saldoFinal: number;
}

const somar = (vs: readonly string[]): Valor => vs.reduce((s, v) => s.plus(v), dec(0));

/** Agrupa a tabela mensal por ano do contrato (12 parcelas por ano; o último pode ter menos). */
export function financiamentoPorAno(linhas: readonly LinhaTabela[]): AnoFinanciamento[] {
  const anos: AnoFinanciamento[] = [];
  for (let i = 0; i < linhas.length; i += 12) {
    const bloco = linhas.slice(i, i + 12);
    const ultima = bloco[bloco.length - 1];
    anos.push({
      ano: i / 12 + 1,
      juros: somar(bloco.map((l) => l.juros)).toNumber(),
      amortizacao: somar(bloco.map((l) => l.amortizacao)).toNumber(),
      pago: somar(bloco.map((l) => l.parcelaTotal)).toNumber(),
      saldoFinal: ultima ? dec(ultima.saldoFinal).toNumber() : 0,
    });
  }
  return anos;
}

export interface MesFluxo {
  readonly mes: string;
  readonly entradas: number;
  readonly saidas: number;
}

const ENTRADAS = new Set(["receita", "resgate"]);

/** Entradas e saídas por mês (AAAA-MM), em reais, dos lançamentos; câmbio aplicado em dólar. */
export function fluxoPorMes(lancamentos: readonly LancamentoImobiliario[]): MesFluxo[] {
  const meses = new Map<string, { entradas: Valor; saidas: Valor }>();
  for (const l of lancamentos) {
    const mes = l.data.slice(0, 7);
    const atual = meses.get(mes) ?? { entradas: dec(0), saidas: dec(0) };
    const valor = dec(l.valor).times(l.cambio ?? 1);
    if (ENTRADAS.has(l.tipo)) atual.entradas = atual.entradas.plus(valor);
    else atual.saidas = atual.saidas.plus(valor);
    meses.set(mes, atual);
  }
  return [...meses.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([mes, v]) => ({ mes, entradas: v.entradas.toNumber(), saidas: -v.saidas.toNumber() }));
}

/** "2026-03" → "mar/26". */
export function rotuloMes(mes: string): string {
  const nomes = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const [ano = "", m = "1"] = mes.split("-");
  return `${nomes[Number(m) - 1] ?? m}/${ano.slice(2)}`;
}
