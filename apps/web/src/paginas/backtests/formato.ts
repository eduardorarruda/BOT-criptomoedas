import { formatarPercentual, TRACO } from "../../lib/formatar";

const dataCurta = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });

export const dataDoEixo = (ms: number): string => dataCurta.format(ms);
export const pct = (f: number | null | undefined, casas = 1): string =>
  f === null || f === undefined ? TRACO : formatarPercentual(f, { casas });
export const pctSinal = (f: number | null | undefined, casas = 1): string =>
  f === null || f === undefined ? TRACO : formatarPercentual(f, { casas, sinal: true });

/** Razões (Sharpe, fator de lucro…): duas casas com vírgula; traço quando não há. */
export function razao(v: number | null | undefined, casas = 2): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return TRACO;
  return v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

/** "3 dias", "5 h", "2 meses": a duração de uma queda, em linguagem de gente. */
export function duracao(ms: number): string {
  const horas = ms / 3_600_000;
  if (horas < 48) return `${Math.round(horas)} h`;
  const dias = horas / 24;
  if (dias < 60) return `${Math.round(dias)} dias`;
  return `${(dias / 30.4).toFixed(1).replace(".", ",")} meses`;
}

/** Anos como texto curto: "1,0 ano", "2,3 anos" ou "120 dias". */
export function anos(a: number): string {
  if (a < 1) return `${Math.round(a * 365)} dias`;
  const t = a.toFixed(1).replace(".", ",");
  return a < 2 ? `${t} ano` : `${t} anos`;
}
