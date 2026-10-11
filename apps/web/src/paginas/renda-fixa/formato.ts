import type { Indexador, Liquidez, TipoTitulo } from "@zentrade/contratos/esquemas";
import { dec, type Valor } from "@zentrade/dominio";

/**
 * Formatação da renda fixa em pt-BR, sempre a partir de texto decimal (nada de
 * ponto flutuante no caminho do dinheiro).
 */
export const TRACO = "—";
const MENOS = "−";

function ler(texto: string | null | undefined): Valor | null {
  if (texto === null || texto === undefined || texto.trim() === "") return null;
  try {
    return dec(texto);
  } catch {
    return null;
  }
}

function ptBr(v: Valor, casas: number): string {
  const [inteiro = "0", fracao] = v.abs().toFixed(casas).split(".");
  const milhar = inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return fracao ? `${milhar},${fracao}` : milhar;
}

function sinal(v: Valor, comMais: boolean): string {
  if (v.isZero()) return "";
  if (v.isNegative()) return MENOS;
  return comMais ? "+" : "";
}

export function reais(texto: string | null | undefined, opcoes: { sinal?: boolean } = {}): string {
  const v = ler(texto);
  if (!v) return TRACO;
  const arredondado = dec(v.toFixed(2));
  return `${sinal(arredondado, opcoes.sinal ?? false)}R$ ${ptBr(arredondado, 2)}`;
}

/** Texto já em % ("13.65" → "13,65%"). */
export function pct(
  texto: string | null | undefined,
  opcoes: { casas?: number; sinal?: boolean } = {},
): string {
  const v = ler(texto);
  if (!v) return TRACO;
  const arredondado = dec(v.toFixed(opcoes.casas ?? 2));
  return `${sinal(arredondado, opcoes.sinal ?? false)}${ptBr(arredondado, opcoes.casas ?? 2)}%`;
}

/** Fração ("0.25") em % ("25%"), para a alocação. */
export const fracaoPct = (texto: string, casas = 1): string => {
  const v = ler(texto);
  return v ? pct(v.times(100).toFixed(), { casas }) : TRACO;
};

/** "2026-10-13" → "13/10/2026". */
export const data = (dia: string | null | undefined): string =>
  dia && /^\d{4}-\d{2}-\d{2}$/.test(dia)
    ? `${dia.slice(8, 10)}/${dia.slice(5, 7)}/${dia.slice(0, 4)}`
    : TRACO;

export const tomDe = (texto: string | null | undefined): "ganho" | "perda" | "" => {
  const v = ler(texto);
  if (!v || v.isZero()) return "";
  return v.isNegative() ? "perda" : "ganho";
};

export const TIPO: Readonly<Record<TipoTitulo, string>> = {
  CDB: "CDB",
  LC: "LC",
  LCI: "LCI",
  LCA: "LCA",
  CRI: "CRI",
  CRA: "CRA",
  DEBENTURE: "Debênture",
  DEBENTURE_INCENTIVADA: "Debênture incentivada",
  TESOURO_SELIC: "Tesouro Selic",
  TESOURO_PREFIXADO: "Tesouro Prefixado",
  TESOURO_IPCA: "Tesouro IPCA+",
  POUPANCA: "Poupança",
  CAIXINHA: "Caixinha",
  OUTRO: "Outro",
};

export const INDEXADOR: Readonly<Record<Indexador, string>> = {
  CDI: "CDI",
  SELIC: "Selic",
  IPCA: "IPCA",
  PREFIXADO: "Prefixado",
  POUPANCA: "Poupança",
};

export const LIQUIDEZ: Readonly<Record<Liquidez, string>> = {
  diaria: "Diária",
  vencimento: "No vencimento",
  carencia: "Após carência",
};

/** Como o título rende, em uma linha: "110% do CDI", "IPCA + 6,1% a.a.", "12,5% a.a.". */
export function rentabilidadeContratada(t: {
  readonly indexador: Indexador;
  readonly percentualIndexador: string | null;
  readonly taxaAnual: string | null;
}): string {
  const taxa = t.taxaAnual ? `${pct(t.taxaAnual, { casas: 2 })} a.a.` : "";
  switch (t.indexador) {
    case "CDI":
    case "SELIC": {
      const artigo = t.indexador === "SELIC" ? "da" : "do";
      const base = `${pct(t.percentualIndexador ?? "100", { casas: 0 })} ${artigo} ${INDEXADOR[t.indexador]}`;
      return taxa ? `${base} + ${taxa}` : base;
    }
    case "IPCA":
      return `IPCA + ${taxa || "0% a.a."}`;
    case "PREFIXADO":
      return taxa || TRACO;
    case "POUPANCA":
      return "Regra da poupança";
  }
}
