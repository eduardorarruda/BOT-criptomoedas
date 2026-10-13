/**
 * Cabeça da página (título, descrição, robôs de busca, dados estruturados). Sem DOM:
 * serve à tela (a cada troca de rota) e ao build do Vite (index.html, robots.txt e
 * sitemap.xml).
 *
 * Por padrão a instância é PRIVADA: cada pessoa roda a sua, e a página de login de
 * uma instância privada não deve aparecer em buscador. `VITE_PUBLICO=1` (com
 * `VITE_URL_PUBLICA`) liga a indexação só das páginas públicas, para uma demonstração
 * ou página de apresentação. Veja docs/operacao.md.
 */
export const NOME = "ZenTrade";
export const REPOSITORIO = "https://github.com/eduardorarruda/BOT-criptomoedas";
export const LICENCA_URL = "https://www.gnu.org/licenses/agpl-3.0.html";
export const IDIOMA = "pt-BR";
export const DESCRICAO_PADRAO =
  "Software livre e auto-hospedado para operar cripto com robôs e acompanhar seus investimentos. " +
  "Regras decidem, a IA argumenta, o risco tem a palavra final.";

export const ROBOS_PRIVADO = "noindex, nofollow";
export const ROBOS_PUBLICO = "index, follow, max-image-preview:large";

export interface OpcoesSeo {
  /** A instância aceita indexação das páginas públicas. */
  readonly publico: boolean;
  /** Endereço público, sem barra no fim (ex.: https://demo.exemplo.org). */
  readonly urlPublica?: string;
  readonly versao: string;
}

/** Uma página que qualquer pessoa vê sem entrar. São as únicas do sitemap. */
export interface PaginaPublica {
  readonly caminho: string;
  readonly titulo: string;
  readonly descricao: string;
}

export const PAGINAS_PUBLICAS: readonly PaginaPublica[] = [
  {
    caminho: "/entrar",
    titulo: "Entrar",
    descricao: `Entre no ${NOME}: acompanhe seus robôs de cripto e seus investimentos numa instância que é sua.`,
  },
  {
    caminho: "/privacidade",
    titulo: "Política de privacidade",
    descricao: `Quais dados pessoais o ${NOME} trata, para quê, com quem compartilha e como exercer seus direitos pela LGPD.`,
  },
];

/**
 * Lê as variáveis do build. Falha cedo quando a instância é pública sem endereço:
 * canônico, sitemap e imagem social precisam de URL absoluta.
 */
export function lerOpcoesSeo(env: Readonly<Record<string, string | undefined>>, versao: string): OpcoesSeo {
  const publico = env.VITE_PUBLICO === "1";
  const bruta = env.VITE_URL_PUBLICA?.trim();
  if (!bruta) {
    if (publico)
      throw new Error("VITE_PUBLICO=1 exige VITE_URL_PUBLICA=https://seu-endereco (veja docs/operacao.md).");
    return { publico, versao };
  }
  let url: URL;
  try {
    url = new URL(bruta);
  } catch {
    throw new Error(
      `VITE_URL_PUBLICA inválida: "${bruta}". Use o endereço completo, como https://demo.exemplo.org.`,
    );
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(`VITE_URL_PUBLICA precisa começar com https:// (recebido "${bruta}").`);
  }
  if (url.search || url.hash) throw new Error("VITE_URL_PUBLICA não pode ter ?consulta nem #âncora.");
  return { publico, versao, urlPublica: `${url.origin}${url.pathname}`.replace(/\/+$/, "") };
}

/** "Página · ZenTrade"; sem página, só o nome. */
export function tituloDaPagina(pagina?: string): string {
  const limpo = pagina?.trim();
  return limpo ? `${limpo} · ${NOME}` : NOME;
}

export function paginaPublica(caminho: string): PaginaPublica | undefined {
  const normal = caminho.length > 1 ? caminho.replace(/\/+$/, "") : caminho;
  return PAGINAS_PUBLICAS.find((p) => p.caminho === normal);
}

/** Só página pública de instância pública entra no buscador; o resto, nunca. */
export function diretivaRobos(opcoes: OpcoesSeo, caminho: string): string {
  return opcoes.publico && paginaPublica(caminho) ? ROBOS_PUBLICO : ROBOS_PRIVADO;
}

export function urlAbsoluta(opcoes: OpcoesSeo, caminho: string): string | undefined {
  return opcoes.urlPublica
    ? `${opcoes.urlPublica}${caminho.startsWith("/") ? caminho : `/${caminho}`}`
    : undefined;
}

/** Canônico só para página pública de instância pública. */
export function urlCanonica(opcoes: OpcoesSeo, caminho: string): string | undefined {
  const pagina = paginaPublica(caminho);
  return opcoes.publico && pagina ? urlAbsoluta(opcoes, pagina.caminho) : undefined;
}

type Json = string | number | boolean | null | readonly Json[] | { readonly [chave: string]: Json };

/**
 * Schema.org: o software (SoftwareApplication), o código (SoftwareSourceCode) e, com
 * endereço público, o site (WebSite). Sem organização nem pessoa inventadas, sem nota
 * nem avaliação: só o que é verdade em qualquer instância.
 */
export function dadosEstruturados(opcoes: OpcoesSeo): { readonly [chave: string]: Json } {
  const base = opcoes.urlPublica ?? REPOSITORIO;
  const idSoftware = `${base}#software`;
  const grafo: Json[] = [
    {
      "@type": "SoftwareApplication",
      "@id": idSoftware,
      name: NOME,
      description: DESCRICAO_PADRAO,
      url: opcoes.urlPublica ? `${opcoes.urlPublica}/` : REPOSITORIO,
      applicationCategory: "FinanceApplication",
      applicationSubCategory: "Robôs de cripto e acompanhamento de investimentos",
      operatingSystem: "Linux, macOS ou Windows com Docker; uso pelo navegador",
      softwareVersion: opcoes.versao,
      inLanguage: IDIOMA,
      isAccessibleForFree: true,
      license: LICENCA_URL,
      offers: { "@type": "Offer", price: "0", priceCurrency: "BRL", areaServed: "BR" },
      ...(opcoes.urlPublica ? { image: `${opcoes.urlPublica}/og.png` } : {}),
    },
    {
      "@type": "SoftwareSourceCode",
      "@id": `${REPOSITORIO}#codigo`,
      name: `${NOME} (código-fonte)`,
      codeRepository: REPOSITORIO,
      programmingLanguage: "TypeScript",
      license: LICENCA_URL,
      inLanguage: IDIOMA,
      targetProduct: { "@id": idSoftware },
    },
  ];
  if (opcoes.urlPublica) {
    grafo.push({
      "@type": "WebSite",
      "@id": `${opcoes.urlPublica}/#site`,
      url: `${opcoes.urlPublica}/`,
      name: NOME,
      description: DESCRICAO_PADRAO,
      inLanguage: IDIOMA,
      about: { "@id": idSoftware },
    });
  }
  return { "@context": "https://schema.org", "@graph": grafo };
}

/** JSON para dentro de <script>: "<" escapado, para nenhum texto fechar a tag. */
export function jsonParaScript(dados: unknown): string {
  return JSON.stringify(dados).replace(/</g, "\\u003c");
}

/** Uma tag para o <head> do index.html, no formato que o Vite injeta. */
export interface TagCabeca {
  readonly tag: "meta" | "link" | "script";
  readonly attrs: Readonly<Record<string, string>>;
  readonly children?: string;
}

/** As tags que dependem do build (robôs, endereço, imagem social, JSON-LD). */
export function tagsDoBuild(opcoes: OpcoesSeo): TagCabeca[] {
  const tags: TagCabeca[] = [
    // Privada: noindex em tudo. Pública: o index.html libera e a tela devolve o noindex
    // às rotas de quem entrou (CabecaDaRota), que não estão no sitemap.
    { tag: "meta", attrs: { name: "robots", content: opcoes.publico ? ROBOS_PUBLICO : ROBOS_PRIVADO } },
  ];
  const url = opcoes.urlPublica;
  if (url) {
    const imagem = `${url}/og.png`;
    tags.push(
      { tag: "meta", attrs: { property: "og:url", content: `${url}/` } },
      { tag: "meta", attrs: { property: "og:image", content: imagem } },
      { tag: "meta", attrs: { property: "og:image:secure_url", content: imagem } },
      { tag: "meta", attrs: { property: "og:image:type", content: "image/png" } },
      { tag: "meta", attrs: { property: "og:image:width", content: "1200" } },
      { tag: "meta", attrs: { property: "og:image:height", content: "630" } },
      { tag: "meta", attrs: { property: "og:image:alt", content: TEXTO_ALT_IMAGEM } },
      { tag: "meta", attrs: { name: "twitter:image", content: imagem } },
      { tag: "meta", attrs: { name: "twitter:image:alt", content: TEXTO_ALT_IMAGEM } },
    );
    if (opcoes.publico) {
      tags.push(
        { tag: "link", attrs: { rel: "alternate", hreflang: IDIOMA, href: `${url}/` } },
        { tag: "link", attrs: { rel: "alternate", hreflang: "x-default", href: `${url}/` } },
      );
    }
  }
  tags.push({
    tag: "script",
    attrs: { type: "application/ld+json", id: "dados-estruturados" },
    children: jsonParaScript(dadosEstruturados(opcoes)),
  });
  return tags;
}

export const TEXTO_ALT_IMAGEM =
  "Símbolo Ensō do ZenTrade ao lado do lema: Regras decidem. A IA argumenta. O risco tem a palavra final.";

/** robots.txt: privado bloqueia tudo; público libera as páginas e aponta o sitemap. */
export function robotsTxt(opcoes: OpcoesSeo): string {
  if (!opcoes.publico || !opcoes.urlPublica) {
    return [
      "# Instância privada do ZenTrade: nada aqui é para buscador.",
      "# Para uma demonstração pública, veja docs/operacao.md (VITE_PUBLICO).",
      "User-agent: *",
      "Disallow: /",
      "",
    ].join("\n");
  }
  return [
    "# ZenTrade: só as páginas públicas são indexáveis; a API e as telas de quem entrou, não.",
    "User-agent: *",
    ...PAGINAS_PUBLICAS.map((p) => `Allow: ${p.caminho}`),
    "Allow: /llms.txt",
    "Disallow: /api/",
    "",
    `Sitemap: ${opcoes.urlPublica}/sitemap.xml`,
    "",
  ].join("\n");
}

const escaparXml = (texto: string): string =>
  texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** sitemap.xml só com as páginas públicas; `null` em instância privada (não publica). */
export function sitemapXml(opcoes: OpcoesSeo, dataIso: string): string | null {
  if (!opcoes.publico || !opcoes.urlPublica) return null;
  const urls = PAGINAS_PUBLICAS.map((p) => {
    const loc = escaparXml(`${opcoes.urlPublica}${p.caminho}`);
    return [
      "  <url>",
      `    <loc>${loc}</loc>`,
      `    <xhtml:link rel="alternate" hreflang="${IDIOMA}" href="${loc}"/>`,
      `    <lastmod>${dataIso}</lastmod>`,
      "  </url>",
    ].join("\n");
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    ...urls,
    "</urlset>",
    "",
  ].join("\n");
}
