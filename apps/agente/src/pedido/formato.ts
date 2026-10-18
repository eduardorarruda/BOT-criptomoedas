import { MS_POR_INTERVALO, type Intervalo } from "@zentrade/contratos";

/** Números do pedido em pt-BR, como uma pessoa escreveria. */
const comCasas = (casas: number) => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: casas });
const N0 = comCasas(0);
const N1 = comCasas(1);
const N2 = comCasas(2);
const N4 = comCasas(4);

export const num = (n: number, casas = 2): string =>
  (casas === 0 ? N0 : casas === 1 ? N1 : casas === 4 ? N4 : N2).format(n);

/** Fração como porcentagem: 0,0273 → "2,73%". */
export const pct = (fracao: number, casas = 2): string => `${num(fracao * 100, casas)}%`;

/** Com sinal explícito: "+0,75%", "−2,73%". */
export const pctSinal = (fracao: number, casas = 2): string =>
  `${fracao > 0 ? "+" : fracao < 0 ? "−" : ""}${pct(Math.abs(fracao), casas)}`;

/** Preço com até 2 casas (até 4 para preços pequenos). */
export const preco = (n: number): string => num(n, Math.abs(n) < 10 ? 4 : 2);

/** Quanto tempo cobrem `velas` velas do intervalo: "4 h", "2 dias", "30 min". */
export function duracao(velas: number, intervalo: Intervalo): string {
  const minutos = (velas * MS_POR_INTERVALO[intervalo]) / 60_000;
  if (minutos < 60) return `${num(minutos, 0)} min`;
  const horas = minutos / 60;
  if (horas < 48) return `${num(horas, 1)} h`;
  return `${num(horas / 24, 1)} dias`;
}
