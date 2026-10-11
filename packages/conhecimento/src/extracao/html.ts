import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";

/** Mais que isso de HTML não vale analisar (e protege a memória do serviço). */
const LIMITE_HTML = 5_000_000;
const RUIDO = "script, style, noscript, template, svg, iframe, nav, footer, header, form";

export interface TextoDoHtml {
  readonly titulo: string | null;
  readonly texto: string;
}

const limpar = (t: string | null | undefined): string =>
  (t ?? "")
    .replace(/[ \t\f\v\u00a0]+/g, " ")
    .replace(/\n\s*\n\s*/g, "\n\n")
    .trim();

/** Texto do corpo sem scripts, estilos e navegação: o plano B quando a Readability não acha artigo. */
function textoDoCorpo(html: string): string {
  const { document } = parseHTML(html);
  for (const no of document.querySelectorAll(RUIDO)) no.remove();
  const blocos = [...document.querySelectorAll("h1, h2, h3, h4, p, li, td, pre, blockquote")]
    .map((n) => limpar(n.textContent))
    .filter((t) => t !== "");
  return blocos.length > 0 ? blocos.join("\n\n") : limpar(document.body?.textContent);
}

/**
 * Texto legível de uma página: o artigo principal (Readability, a mesma do modo leitura
 * do Firefox) e, se não houver artigo, o texto do corpo. Nenhum script roda: o linkedom
 * só monta a árvore.
 */
export function textoDoHtml(html: string): TextoDoHtml {
  const fonte = html.length > LIMITE_HTML ? html.slice(0, LIMITE_HTML) : html;
  const { document } = parseHTML(fonte);
  const tituloPagina = limpar(document.querySelector("title")?.textContent) || null;
  const artigo = new Readability(document as unknown as ConstructorParameters<typeof Readability>[0]).parse();
  // O HTML do artigo (e não o textContent) preserva a separação dos parágrafos.
  const textoArtigo = artigo?.content ? textoDoCorpo(artigo.content) : "";
  const texto = textoArtigo.length >= 200 ? textoArtigo : textoDoCorpo(fonte);
  return { titulo: limpar(artigo?.title) || tituloPagina, texto };
}
