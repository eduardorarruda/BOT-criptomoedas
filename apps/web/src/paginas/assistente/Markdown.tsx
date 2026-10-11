import { Fragment, type ReactNode } from "react";
import { linkSeguro } from "../../lib/link";
import { lerMarkdown, type Bloco, type Trecho } from "./markdown";

function Trechos({ trechos }: { readonly trechos: readonly Trecho[] }): ReactNode {
  return trechos.map((t, i) => {
    switch (t.tipo) {
      case "forte":
        return (
          <strong key={i}>
            <Trechos trechos={t.filhos} />
          </strong>
        );
      case "enfase":
        return (
          <em key={i}>
            <Trechos trechos={t.filhos} />
          </em>
        );
      case "codigo":
        return <code key={i}>{t.texto}</code>;
      case "link": {
        const url = linkSeguro(t.url);
        return url ? (
          <a key={i} href={url} target="_blank" rel="noopener noreferrer nofollow">
            {t.texto}
          </a>
        ) : (
          <Fragment key={i}>{t.texto}</Fragment>
        );
      }
      default:
        return <Fragment key={i}>{t.texto}</Fragment>;
    }
  });
}

function Tabela({ bloco }: { readonly bloco: Extract<Bloco, { tipo: "tabela" }> }) {
  return (
    <div className="md__tabela">
      <table>
        <thead>
          <tr>
            {bloco.cabecalho.map((c, i) => (
              <th key={i} scope="col">
                <Trechos trechos={c} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {bloco.linhas.map((linha, i) => (
            <tr key={i}>
              {linha.map((c, j) => (
                <td key={j}>
                  <Trechos trechos={c} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BlocoMd({ bloco }: { readonly bloco: Bloco }) {
  switch (bloco.tipo) {
    case "titulo": {
      const Tag = `h${bloco.nivel + 1}` as "h3" | "h4" | "h5";
      return (
        <Tag className="md__titulo">
          <Trechos trechos={bloco.trechos} />
        </Tag>
      );
    }
    case "lista": {
      const Lista = bloco.ordenada ? "ol" : "ul";
      return (
        <Lista>
          {bloco.itens.map((item, i) => (
            <li key={i}>
              <Trechos trechos={item} />
            </li>
          ))}
        </Lista>
      );
    }
    case "citacao":
      return (
        <blockquote>
          <Trechos trechos={bloco.trechos} />
        </blockquote>
      );
    case "codigo":
      return (
        <pre>
          <code>{bloco.texto}</code>
        </pre>
      );
    case "tabela":
      return <Tabela bloco={bloco} />;
    default:
      return (
        <p>
          <Trechos trechos={bloco.trechos} />
        </p>
      );
  }
}

/** Texto do assistente em markdown simples, sem HTML cru. */
export function Markdown({ texto }: { readonly texto: string }) {
  return (
    <div className="md">
      {lerMarkdown(texto).map((b, i) => (
        <BlocoMd key={i} bloco={b} />
      ))}
    </div>
  );
}
