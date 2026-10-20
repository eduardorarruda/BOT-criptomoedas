import { formatarNumero, rotulo, type Comparador, type Direcao, type Sentido } from "@zentrade/dominio";
import type { NoEditor } from "./arvore";
import type { Arvore } from "./estado";
import type { CamposSaida } from "./saidas";

/**
 * Prévia em linguagem natural da árvore, a partir do `rotulo` do domínio — os
 * mesmos nomes que aparecem nas explicações das decisões.
 */
const VERBO: Record<Comparador, string> = {
  "<": "abaixo de",
  "<=": "no máximo",
  ">": "acima de",
  ">=": "pelo menos",
  cruzouAcima: "cruzar para cima de",
  cruzouAbaixo: "cruzar para baixo de",
};

export const fraseComparador = (c: Comparador): string => VERBO[c];

export function frase(no: NoEditor | null, aninhado = false): string {
  if (!no) return "(vazio)";
  switch (no.tipo) {
    case "comparar":
      return `${rotulo(no.esquerda)} ${VERBO[no.comparador]} ${rotulo(no.direita)}`;
    case "horario":
      return `o candle abrir entre ${no.de} e ${no.ate} (horário de Brasília)`;
    case "nao":
      return `não (${frase(no.filho)})`;
    case "e":
    case "ou": {
      if (no.filhos.length === 0) return "(grupo vazio)";
      const corpo = no.filhos.map((f) => frase(f, true)).join(no.tipo === "e" ? " e " : " ou ");
      return aninhado && no.filhos.length > 1 ? `(${corpo})` : corpo;
    }
  }
}

export interface Linha {
  readonly nivel: number;
  readonly texto: string;
}

export function linhas(no: NoEditor | null, nivel = 0): Linha[] {
  if (!no) return [{ nivel, texto: "falta uma condição aqui" }];
  switch (no.tipo) {
    case "comparar":
    case "horario":
      return [{ nivel, texto: frase(no) }];
    case "nao":
      return [{ nivel, texto: "esta NÃO pode valer:" }, ...linhas(no.filho, nivel + 1)];
    case "e":
    case "ou": {
      const cabeca = no.tipo === "e" ? "todas estas precisam valer:" : "basta uma destas valer:";
      if (no.filhos.length === 0) return [{ nivel, texto: `${cabeca} (nenhuma ainda)` }];
      return [{ nivel, texto: cabeca }, ...no.filhos.flatMap((f) => linhas(f, nivel + 1))];
    }
  }
}

const DIRECAO: Record<Direcao, string> = {
  comprado: "só compra (ganha quando o preço sobe)",
  vendido: "só vende a descoberto (ganha quando o preço cai); só no backtest do mini índice",
  ambos:
    "compra ou vende a descoberto, conforme a regra que valer; o lado vendido só no backtest do mini índice",
};

export const fraseDirecao = (d: Direcao): string => DIRECAO[d];

export interface FraseLado {
  readonly arvore: Arvore;
  readonly verbo: string;
  readonly texto: string;
}

type Regras = { readonly direcao: Direcao } & Readonly<
  Record<Exclude<Arvore, "entrada">, NoEditor | null>
> & {
    readonly entrada: NoEditor;
  };

const saidaEm = (no: NoEditor | null): string =>
  no ? `${frase(no)}, ou no stop ou no alvo` : "o preço chegar ao stop ou ao alvo";

/**
 * Cada lado que a direção usa em uma frase: "Compra quando …", "Vende quando …"
 * (a venda a descoberto) e "Recompra quando …" (a saída dela). Nos dois sentidos,
 * a saída da compra vira "Sai da compra quando", para não confundir com a venda.
 */
export function frasesLados(r: Regras): FraseLado[] {
  const comprado: FraseLado[] = [
    { arvore: "entrada", verbo: "Compra quando", texto: frase(r.entrada) },
    {
      arvore: "saida",
      verbo: r.direcao === "ambos" ? "Sai da compra quando" : "Vende quando",
      texto: saidaEm(r.saida),
    },
  ];
  const vendido: FraseLado[] = [
    { arvore: "entradaVendida", verbo: "Vende quando", texto: frase(r.entradaVendida) },
    { arvore: "saidaVendida", verbo: "Recompra quando", texto: saidaEm(r.saidaVendida) },
  ];
  if (r.direcao === "comprado") return comprado;
  return r.direcao === "vendido" ? vendido : [...comprado, ...vendido];
}

const pct = (fracao: number): string => `${formatarNumero(fracao * 100)}%`;
const atr = (u: { readonly periodo: number; readonly multiplo: number }): string =>
  `${formatarNumero(u.multiplo)} × ATR(${u.periodo})`;

/** As palavras que mudam do comprado para o vendido (o espelho). */
const LADO: Record<Sentido, { readonly stop: string; readonly extremo: string; readonly rumo: string }> = {
  comprado: { stop: "abaixo", extremo: "maior máxima", rumo: "só sobe" },
  vendido: { stop: "acima", extremo: "menor mínima", rumo: "só desce" },
};

/**
 * As saídas em frases curtas, na ordem em que o robô olha para elas. No vendido,
 * o espelho (stop acima, menor mínima); nos dois sentidos, as do comprado e uma
 * frase lembrando o espelho.
 */
export function frasesSaidas(
  e: { readonly stop: number | null } & CamposSaida,
  direcao: Direcao = "comprado",
): string[] {
  const l = LADO[direcao === "vendido" ? "vendido" : "comprado"];
  const frases: string[] = [];
  if (e.stopAtr)
    frases.push(
      `stop a ${atr(e.stopAtr)} ${l.stop} da entrada${e.stop !== null ? `, no máximo ${pct(e.stop)}` : ""}`,
    );
  else if (e.stop !== null) frases.push(`stop ${pct(e.stop)} ${l.stop} da entrada`);
  if (e.stopMovel?.tipo === "percentual")
    frases.push(
      `stop móvel ${pct(e.stopMovel.distancia)} ${l.stop} da ${l.extremo} desde a entrada (${l.rumo})`,
    );
  if (e.stopMovel?.tipo === "atr")
    frases.push(`stop móvel a ${atr(e.stopMovel)} da ${l.extremo} desde a entrada (${l.rumo})`);
  if (e.empate)
    frases.push(`depois de +${pct(e.empate.gatilho)}, o stop vai para o empate (as duas taxas pagas)`);
  if (e.tempoMaximo !== undefined)
    frases.push(`sai depois de ${e.tempoMaximo} candles, se nada disso vier antes`);
  if (e.tamanhoPorVolatilidade)
    frases.push(`tamanho: risco por operação ÷ (${atr(e.tamanhoPorVolatilidade)})`);
  if (direcao === "ambos" && (e.stopAtr || e.stop !== null || e.stopMovel))
    frases.push("na venda, o espelho: stop acima da entrada e stop móvel pela menor mínima (só desce)");
  return frases;
}
