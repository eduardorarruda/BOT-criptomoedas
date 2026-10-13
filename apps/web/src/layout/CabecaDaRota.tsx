import { useLocation } from "@tanstack/react-router";
import { useEffect } from "react";
import {
  DESCRICAO_PADRAO,
  diretivaRobos,
  lerOpcoesSeo,
  paginaPublica,
  tituloDaPagina,
  urlCanonica,
  type OpcoesSeo,
} from "../lib/cabeca";
import { NAVEGACAO } from "./navegacao";

/**
 * Atualiza o <head> a cada troca de rota: título "Página · ZenTrade", descrição,
 * robôs de busca e canônico. Não desenha nada.
 */
export interface Cabeca {
  readonly titulo: string;
  readonly descricao: string;
  readonly robos: string;
  readonly canonico?: string;
}

/** O build já validou as variáveis; aqui, na dúvida, a instância é privada. */
export function opcoesDoBuild(
  env: Readonly<Record<string, string | undefined>> = {
    VITE_PUBLICO: import.meta.env.VITE_PUBLICO,
    VITE_URL_PUBLICA: import.meta.env.VITE_URL_PUBLICA,
  },
): OpcoesSeo {
  try {
    return lerOpcoesSeo(env, __ZENTRADE_VERSAO__);
  } catch {
    return { publico: false, versao: __ZENTRADE_VERSAO__ };
  }
}

/** O rótulo do menu para o caminho; o item mais específico ganha ("/imobiliario/novo" → "Imobiliário"). */
function rotuloDoMenu(caminho: string): string | undefined {
  const itens = NAVEGACAO.flatMap((g) => g.itens)
    .filter((i) =>
      i.para === "/" ? caminho === "/" : caminho === i.para || caminho.startsWith(`${i.para}/`),
    )
    .sort((a, b) => b.para.length - a.para.length);
  return itens[0]?.rotulo;
}

export function cabecaDe(caminho: string, opcoes: OpcoesSeo): Cabeca {
  const publica = paginaPublica(caminho);
  const canonico = urlCanonica(opcoes, caminho);
  return {
    titulo: tituloDaPagina(publica?.titulo ?? rotuloDoMenu(caminho)),
    descricao: publica?.descricao ?? DESCRICAO_PADRAO,
    robos: diretivaRobos(opcoes, caminho),
    ...(canonico ? { canonico } : {}),
  };
}

function definirMeta(doc: Document, atributo: "name" | "property", chave: string, valor: string): void {
  let el = doc.head.querySelector<HTMLMetaElement>(`meta[${atributo}="${chave}"]`);
  if (!el) {
    el = doc.createElement("meta");
    el.setAttribute(atributo, chave);
    doc.head.append(el);
  }
  el.content = valor;
}

export function aplicarCabeca(doc: Document, cabeca: Cabeca): void {
  doc.title = cabeca.titulo;
  definirMeta(doc, "name", "description", cabeca.descricao);
  definirMeta(doc, "name", "robots", cabeca.robos);
  definirMeta(doc, "property", "og:title", cabeca.titulo);
  definirMeta(doc, "property", "og:description", cabeca.descricao);
  definirMeta(doc, "name", "twitter:title", cabeca.titulo);
  definirMeta(doc, "name", "twitter:description", cabeca.descricao);
  const link = doc.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!cabeca.canonico) {
    link?.remove();
    return;
  }
  definirMeta(doc, "property", "og:url", cabeca.canonico);
  if (link) {
    link.href = cabeca.canonico;
    return;
  }
  const novo = doc.createElement("link");
  novo.rel = "canonical";
  novo.href = cabeca.canonico;
  doc.head.append(novo);
}

const OPCOES = opcoesDoBuild();

export function CabecaDaRota() {
  const { pathname } = useLocation();
  useEffect(() => {
    aplicarCabeca(document, cabecaDe(pathname, OPCOES));
  }, [pathname]);
  return null;
}
