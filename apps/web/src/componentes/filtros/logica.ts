/**
 * Peças puras do sistema de filtros: busca por texto sem acento, listas na URL,
 * ordenação com o desconhecido no fim, agrupamento, contagem e paginação.
 * Nada aqui conhece React nem o roteador.
 */
export type Direcao = "asc" | "desc";

const comparadorTexto = new Intl.Collator("pt-BR", { sensitivity: "base", numeric: true });

/** Minúsculas, sem acento e com um espaço só entre as palavras. */
export function normalizarTexto(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Todas as palavras do termo aparecem em algum dos campos (em qualquer ordem). Termo vazio aceita tudo. */
export function contemTexto(
  termo: string | undefined,
  campos: readonly (string | null | undefined)[],
): boolean {
  const palavras = normalizarTexto(termo ?? "")
    .split(" ")
    .filter(Boolean);
  if (palavras.length === 0) return true;
  const alvo = normalizarTexto(campos.filter(Boolean).join(" "));
  return palavras.every((p) => alvo.includes(p));
}

/**
 * Lista guardada na URL como "A,B": só os valores permitidos, sem repetir, na ordem
 * da definição (a mesma escolha gera sempre a mesma URL).
 */
export function lerLista<T extends string>(valor: unknown, permitidos: readonly T[]): T[] {
  const partes = Array.isArray(valor)
    ? valor.filter((v): v is string => typeof v === "string")
    : typeof valor === "string"
      ? valor.split(",")
      : [];
  const escolhidos = new Set(partes.map((p) => p.trim()));
  return permitidos.filter((p) => escolhidos.has(p));
}

export function escreverLista(valores: readonly string[]): string | undefined {
  return valores.length > 0 ? valores.join(",") : undefined;
}

export function alternarNaLista<T>(lista: readonly T[], valor: T): T[] {
  return lista.includes(valor) ? lista.filter((v) => v !== valor) : [...lista, valor];
}

type Chave = number | string | null | undefined;

function compararChaves(a: Chave, b: Chave): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return comparadorTexto.compare(String(a), String(b));
}

/** Ordena uma cópia. O desconhecido (null/undefined/NaN) vai para o fim nas duas direções. */
export function ordenarPor<T>(itens: readonly T[], chave: (item: T) => Chave, direcao: Direcao): T[] {
  const sinal = direcao === "asc" ? 1 : -1;
  const vazio = (v: Chave) => v === null || v === undefined || (typeof v === "number" && Number.isNaN(v));
  return itens
    .map((item, i) => ({ item, i, k: chave(item) }))
    .sort((x, y) => {
      const [vx, vy] = [vazio(x.k), vazio(y.k)];
      if (vx || vy) return vx === vy ? x.i - y.i : vx ? 1 : -1;
      return sinal * compararChaves(x.k, y.k) || x.i - y.i;
    })
    .map((x) => x.item);
}

export interface Grupo<T> {
  readonly chave: string;
  readonly titulo: string;
  readonly itens: readonly T[];
}

/** Agrupa mantendo a ordem em que cada grupo aparece pela primeira vez. */
export function agruparPor<T>(
  itens: readonly T[],
  chave: (item: T) => string,
  titulo: (chave: string, primeiro: T) => string = (c) => c,
): Grupo<T>[] {
  const grupos = new Map<string, { titulo: string; itens: T[] }>();
  for (const item of itens) {
    const c = chave(item);
    const g = grupos.get(c);
    if (g) g.itens.push(item);
    else grupos.set(c, { titulo: titulo(c, item), itens: [item] });
  }
  return [...grupos.entries()].map(([c, g]) => ({ chave: c, titulo: g.titulo, itens: g.itens }));
}

export function contarPor<T, K>(itens: readonly T[], chave: (item: T) => K): Map<K, number> {
  const contagem = new Map<K, number>();
  for (const item of itens) contagem.set(chave(item), (contagem.get(chave(item)) ?? 0) + 1);
  return contagem;
}

/** Quantos filtros estão valendo (visão, ordem, densidade e página não contam). */
export function contarAtivos(busca: Readonly<Record<string, unknown>>, naoContam: readonly string[]): number {
  return Object.entries(busca).filter(
    ([k, v]) => !naoContam.includes(k) && v !== undefined && v !== "" && v !== false,
  ).length;
}

export interface Pagina<T> {
  readonly itens: readonly T[];
  readonly pagina: number;
  readonly paginas: number;
  readonly total: number;
}

export function paginar<T>(itens: readonly T[], pagina: number, porPagina: number): Pagina<T> {
  const paginas = Math.max(1, Math.ceil(itens.length / porPagina));
  const atual = Math.min(Math.max(1, Math.trunc(pagina) || 1), paginas);
  const inicio = (atual - 1) * porPagina;
  return { itens: itens.slice(inicio, inicio + porPagina), pagina: atual, paginas, total: itens.length };
}
