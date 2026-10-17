import { Check, Copy, ExternalLink } from "lucide-react";
import { memo, type ComponentProps } from "react";
import ReactMarkdown, { type Components, type ExtraProps } from "react-markdown";
import remarkGfm from "remark-gfm";
import { useCopiar } from "../../ganchos/useCopiar";

/**
 * A resposta do assistente em Markdown (com tabelas, do GFM). O texto vem de um modelo
 * de IA que leu dados de fora (notícias, páginas), então é tratado como não confiável:
 * HTML cru nunca é desenhado, imagem vira só o texto alternativo (nada é baixado de
 * fora) e link só sai como link se for http(s) ou mailto.
 */
const PROTOCOLOS = new Set(["http:", "https:", "mailto:"]);

export function urlSegura(url: string): string {
  const limpa = url.trim();
  if (!/^(https?:\/\/|mailto:)/i.test(limpa)) return "";
  try {
    const u = new URL(limpa);
    return PROTOCOLOS.has(u.protocol) ? u.href : "";
  } catch {
    return "";
  }
}

type No = NonNullable<ExtraProps["node"]>;
type Filho = No["children"][number];

/** O texto de um nó da árvore (hast), para copiar o código exatamente como veio. */
function textoDe(no: Filho | undefined): string {
  if (!no) return "";
  if (no.type === "text") return no.value;
  if (no.type === "element") return no.children.map(textoDe).join("");
  return "";
}

function linguagemDe(no: Filho | undefined): string | null {
  if (no?.type !== "element") return null;
  const classes = no.properties.className;
  const lista = Array.isArray(classes) ? classes.map(String) : [];
  const lang = lista.find((c) => c.startsWith("language-"));
  return lang ? lang.slice("language-".length) : null;
}

function BlocoCodigo({ node, children }: ComponentProps<"pre"> & ExtraProps) {
  const [estado, copiar] = useCopiar();
  const codigo = node?.children[0];
  const texto = textoDe(codigo).replace(/\n$/, "");
  const linguagem = linguagemDe(codigo);
  const rotulo =
    estado === "copiado" ? "Código copiado" : estado === "falhou" ? "Não deu para copiar" : "Copiar o código";
  return (
    <div className="md__codigo">
      <div className="md__codigo-barra">
        <span className="md__codigo-lingua">{linguagem ?? "código"}</span>
        <button type="button" className="md__copiar" onClick={() => void copiar(texto)} aria-label={rotulo}>
          {estado === "copiado" ? (
            <Check size={14} aria-hidden="true" />
          ) : (
            <Copy size={14} aria-hidden="true" />
          )}
          <span aria-hidden="true">{estado === "copiado" ? "Copiado" : "Copiar"}</span>
        </button>
      </div>
      {/* eslint-disable-next-line jsx-a11y-x/no-noninteractive-tabindex -- código largo rola de lado: pelo teclado também */}
      <pre tabIndex={0}>{children}</pre>
    </div>
  );
}

function Link({ href, children }: ComponentProps<"a"> & ExtraProps) {
  if (!href) return <span className="md__link-recusado">{children}</span>;
  const externo = !href.startsWith("mailto:");
  return (
    <a href={href} target="_blank" rel="noopener noreferrer nofollow">
      {children}
      {externo ? (
        <ExternalLink size={12} className="md__link-icone" aria-label="(abre em outra aba)" />
      ) : null}
    </a>
  );
}

function Tabela({ children }: ComponentProps<"table"> & ExtraProps) {
  return (
    // eslint-disable-next-line jsx-a11y-x/no-noninteractive-tabindex -- tabela larga rola de lado: pelo teclado também
    <div className="md__tabela" tabIndex={0} role="region" aria-label="Tabela da resposta">
      <table>{children}</table>
    </div>
  );
}

/** Os títulos da resposta ficam abaixo do título da página (h1), sem pular nível. */
const titulo =
  (Tag: "h2" | "h3" | "h4") =>
  ({ children }: ComponentProps<"h1"> & ExtraProps) => <Tag className="md__titulo">{children}</Tag>;

const COMPONENTES: Components = {
  a: Link,
  pre: BlocoCodigo,
  table: Tabela,
  img: ({ alt }) => (alt ? <span className="md__imagem">[imagem: {alt}]</span> : null),
  h1: titulo("h2"),
  h2: titulo("h2"),
  h3: titulo("h3"),
  h4: titulo("h4"),
  h5: titulo("h4"),
  h6: titulo("h4"),
};

const PLUGINS = [remarkGfm];

/** Texto do assistente em Markdown. Memorizado: durante o streaming só a última mensagem muda. */
export const Markdown = memo(function Markdown({ texto }: { readonly texto: string }) {
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={PLUGINS}
        components={COMPONENTES}
        skipHtml
        urlTransform={(url) => urlSegura(url)}
      >
        {texto}
      </ReactMarkdown>
    </div>
  );
});
