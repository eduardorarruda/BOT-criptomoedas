/**
 * Markdown simples da resposta do assistente, lido para uma árvore de blocos e trechos
 * que a tela transforma em elementos React. Nunca vira HTML cru: não há `innerHTML`, e
 * link só sai como link se for http(s) (o resto fica como texto).
 */
export type Trecho =
  | { readonly tipo: "texto"; readonly texto: string }
  | { readonly tipo: "forte"; readonly filhos: Trecho[] }
  | { readonly tipo: "enfase"; readonly filhos: Trecho[] }
  | { readonly tipo: "codigo"; readonly texto: string }
  | { readonly tipo: "link"; readonly texto: string; readonly url: string };

export type Bloco =
  | { readonly tipo: "paragrafo"; readonly trechos: Trecho[] }
  | { readonly tipo: "titulo"; readonly nivel: 2 | 3 | 4; readonly trechos: Trecho[] }
  | { readonly tipo: "lista"; readonly ordenada: boolean; readonly itens: Trecho[][] }
  | { readonly tipo: "citacao"; readonly trechos: Trecho[] }
  | { readonly tipo: "codigo"; readonly texto: string }
  | { readonly tipo: "tabela"; readonly cabecalho: Trecho[][]; readonly linhas: Trecho[][][] };

const INLINE = /(\*\*[^*\n]+\*\*|`[^`\n]+`|\[[^\]\n]+\]\([^)\s]+\)|\*[^*\n]+\*|_[^_\n]+_)/;

/** Trechos de uma linha: **forte**, *ênfase*, `código` e [link](url). */
export function lerTrechos(texto: string): Trecho[] {
  const partes = texto.split(INLINE).filter((p) => p !== "");
  return partes.map((p): Trecho => {
    if (p.startsWith("**") && p.endsWith("**") && p.length > 4)
      return { tipo: "forte", filhos: lerTrechos(p.slice(2, -2)) };
    if (p.startsWith("`") && p.endsWith("`") && p.length > 2)
      return { tipo: "codigo", texto: p.slice(1, -1) };
    const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(p);
    if (link) return { tipo: "link", texto: link[1] ?? "", url: link[2] ?? "" };
    if (/^(\*[^*]+\*|_[^_]+_)$/.test(p)) return { tipo: "enfase", filhos: lerTrechos(p.slice(1, -1)) };
    return { tipo: "texto", texto: p };
  });
}

const celulas = (linha: string): string[] =>
  linha
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((c) => c.trim());

const SEPARADOR_TABELA = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
const ITEM = /^\s*(?:([-*+])|(\d+)[.)])\s+(.*)$/;

function lerTabela(linhas: string[], i: number): { bloco: Bloco; fim: number } | null {
  const cab = linhas[i];
  if (!cab?.trim().startsWith("|") || !SEPARADOR_TABELA.test(linhas[i + 1] ?? "")) return null;
  let fim = i + 2;
  const corpo: Trecho[][][] = [];
  while (fim < linhas.length && (linhas[fim] ?? "").trim().startsWith("|")) {
    corpo.push(celulas(linhas[fim] ?? "").map(lerTrechos));
    fim++;
  }
  return { bloco: { tipo: "tabela", cabecalho: celulas(cab).map(lerTrechos), linhas: corpo }, fim };
}

function lerLista(linhas: string[], i: number): { bloco: Bloco; fim: number } {
  const ordenada = Boolean(ITEM.exec(linhas[i] ?? "")?.[2]);
  const itens: Trecho[][] = [];
  let fim = i;
  for (; fim < linhas.length; fim++) {
    const m = ITEM.exec(linhas[fim] ?? "");
    if (!m || Boolean(m[2]) !== ordenada) break;
    itens.push(lerTrechos(m[3] ?? ""));
  }
  return { bloco: { tipo: "lista", ordenada, itens }, fim };
}

function lerCodigo(linhas: string[], i: number): { bloco: Bloco; fim: number } {
  let fim = i + 1;
  const conteudo: string[] = [];
  while (fim < linhas.length && !(linhas[fim] ?? "").trim().startsWith("```"))
    conteudo.push(linhas[fim++] ?? "");
  return { bloco: { tipo: "codigo", texto: conteudo.join("\n") }, fim: fim + 1 };
}

function blocoDeLinha(linha: string): Bloco | null {
  const titulo = /^(#{1,4})\s+(.*)$/.exec(linha);
  if (titulo) {
    const nivel = Math.min(4, Math.max(2, (titulo[1] ?? "#").length + 1)) as 2 | 3 | 4;
    return { tipo: "titulo", nivel, trechos: lerTrechos(titulo[2] ?? "") };
  }
  if (linha.startsWith(">")) return { tipo: "citacao", trechos: lerTrechos(linha.replace(/^>\s?/, "")) };
  return null;
}

/** Blocos do texto inteiro. Texto pela metade (enquanto a resposta chega) também funciona. */
export function lerMarkdown(texto: string): Bloco[] {
  const linhas = texto.replace(/\r\n?/g, "\n").split("\n");
  const blocos: Bloco[] = [];
  let paragrafo: string[] = [];
  const fecharParagrafo = () => {
    if (paragrafo.length) blocos.push({ tipo: "paragrafo", trechos: lerTrechos(paragrafo.join(" ")) });
    paragrafo = [];
  };
  for (let i = 0; i < linhas.length;) {
    const linha = linhas[i] ?? "";
    const especial = linha.trim().startsWith("```")
      ? lerCodigo(linhas, i)
      : (lerTabela(linhas, i) ?? (ITEM.test(linha) ? lerLista(linhas, i) : null));
    const simples = especial ? null : blocoDeLinha(linha);
    if (especial || simples || linha.trim() === "") fecharParagrafo();
    if (especial) {
      blocos.push(especial.bloco);
      i = especial.fim;
      continue;
    }
    if (simples) blocos.push(simples);
    else if (linha.trim() !== "") paragrafo.push(linha.trim());
    i++;
  }
  fecharParagrafo();
  return blocos;
}
