import type { MetricasPlacarDTO } from "@zentrade/contratos/esquemas";
import { formatarDinheiro, formatarPercentual, TRACO, type Moeda } from "../../lib/formatar";

/** BRL vira R$; o resto (USDT e as outras cotações do cripto) aparece como US$, como no resto da tela. */
export const moedaDaTela = (moeda: string | null): Moeda => (moeda === "BRL" ? "R$" : "US$");

export const porcento = (fracao: number | null): string =>
  fracao === null ? TRACO : formatarPercentual(fracao, { casas: 0 });

/** "0,75": a confiança como o Claude a diz (de 0 a 1). */
export const confianca = (x: number): string =>
  new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(x);

export const dinheiroDoPlacar = (m: MetricasPlacarDTO, valor: string, sinal = false): string =>
  formatarDinheiro(valor, { sinal, moeda: moedaDaTela(m.moeda) });

/** "12 de 19 · entre 41% e 80%": a proporção com o intervalo de 95% em palavras. */
export function contagem(p: MetricasPlacarDTO["aprovacoes"]): string {
  if (p.total === 0) return "nenhuma ainda";
  const base = `${p.acertos} de ${p.total}`;
  return p.intervalo
    ? `${base} · provável entre ${porcento(p.intervalo.inferior)} e ${porcento(p.intervalo.superior)}`
    : base;
}

export type TomPlacar = "ganho" | "atencao" | "neutro";

/** Verde só quando a precisão bate a meta; abaixo, atenção; sem dados, neutro. */
export const tomDaPrecisao = (taxa: number | null, meta: number): TomPlacar =>
  taxa === null ? "neutro" : taxa >= meta ? "ganho" : "atencao";
