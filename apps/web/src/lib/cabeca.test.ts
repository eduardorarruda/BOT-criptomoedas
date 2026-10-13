import { describe, expect, it } from "vitest";
import {
  dadosEstruturados,
  diretivaRobos,
  jsonParaScript,
  lerOpcoesSeo,
  paginaPublica,
  REPOSITORIO,
  ROBOS_PRIVADO,
  ROBOS_PUBLICO,
  robotsTxt,
  sitemapXml,
  tagsDoBuild,
  tituloDaPagina,
  urlCanonica,
  type OpcoesSeo,
} from "./cabeca";

const PRIVADA: OpcoesSeo = { publico: false, versao: "0.1.0" };
const PUBLICA: OpcoesSeo = { publico: true, versao: "0.1.0", urlPublica: "https://demo.exemplo.org" };
const PUBLICA_V1: OpcoesSeo = { ...PUBLICA, versao: "1" };

type No = Record<string, unknown>;
const grafo = (o: OpcoesSeo): No[] => dadosEstruturados(o)["@graph"] as No[];
const doTipo = (o: OpcoesSeo, tipo: string): No | undefined => grafo(o).find((n) => n["@type"] === tipo);

describe("variáveis do build", () => {
  it("sem nada, a instância é privada", () => {
    expect(lerOpcoesSeo({}, "1.0.0")).toEqual({ publico: false, versao: "1.0.0" });
    expect(lerOpcoesSeo({ VITE_PUBLICO: "0", VITE_URL_PUBLICA: "  " }, "1").publico).toBe(false);
  });

  it("pública exige endereço e o normaliza sem barra no fim", () => {
    expect(() => lerOpcoesSeo({ VITE_PUBLICO: "1" }, "1")).toThrow(/exige VITE_URL_PUBLICA/);
    expect(lerOpcoesSeo({ VITE_PUBLICO: "1", VITE_URL_PUBLICA: "https://demo.exemplo.org/" }, "1")).toEqual(
      PUBLICA_V1,
    );
    expect(
      lerOpcoesSeo({ VITE_PUBLICO: "1", VITE_URL_PUBLICA: "https://exemplo.org/zentrade//" }, "1").urlPublica,
    ).toBe("https://exemplo.org/zentrade");
  });

  it("recusa endereço inválido, de outro protocolo ou com consulta", () => {
    expect(() => lerOpcoesSeo({ VITE_URL_PUBLICA: "demo.exemplo.org" }, "1")).toThrow(/inválida/);
    expect(() => lerOpcoesSeo({ VITE_URL_PUBLICA: "ftp://exemplo.org" }, "1")).toThrow(/https/);
    expect(() => lerOpcoesSeo({ VITE_URL_PUBLICA: "https://exemplo.org/?a=1" }, "1")).toThrow(/consulta/);
  });
});

describe("título, robôs e canônico", () => {
  it("título no formato Página · ZenTrade", () => {
    expect(tituloDaPagina("Entrar")).toBe("Entrar · ZenTrade");
    expect(tituloDaPagina("  ")).toBe("ZenTrade");
    expect(tituloDaPagina()).toBe("ZenTrade");
  });

  it("páginas públicas: só login e privacidade (com ou sem barra no fim)", () => {
    expect(paginaPublica("/entrar")?.titulo).toBe("Entrar");
    expect(paginaPublica("/privacidade/")?.titulo).toBe("Política de privacidade");
    expect(paginaPublica("/robos")).toBeUndefined();
    expect(paginaPublica("/")).toBeUndefined();
  });

  it("instância privada nunca deixa indexar, nem o login", () => {
    expect(diretivaRobos(PRIVADA, "/entrar")).toBe(ROBOS_PRIVADO);
    expect(diretivaRobos(PRIVADA, "/privacidade")).toBe(ROBOS_PRIVADO);
    expect(urlCanonica(PRIVADA, "/entrar")).toBeUndefined();
    // Endereço conhecido não basta: sem VITE_PUBLICO=1 continua privada.
    expect(diretivaRobos({ ...PUBLICA, publico: false }, "/entrar")).toBe(ROBOS_PRIVADO);
    expect(urlCanonica({ ...PUBLICA, publico: false }, "/entrar")).toBeUndefined();
  });

  it("instância pública indexa só as páginas públicas", () => {
    expect(diretivaRobos(PUBLICA, "/entrar")).toBe(ROBOS_PUBLICO);
    expect(diretivaRobos(PUBLICA, "/privacidade")).toBe(ROBOS_PUBLICO);
    expect(diretivaRobos(PUBLICA, "/robos")).toBe(ROBOS_PRIVADO);
    expect(diretivaRobos(PUBLICA, "/")).toBe(ROBOS_PRIVADO);
    expect(urlCanonica(PUBLICA, "/privacidade/")).toBe("https://demo.exemplo.org/privacidade");
    expect(urlCanonica(PUBLICA, "/carteira")).toBeUndefined();
  });
});

describe("JSON-LD", () => {
  it("é JSON válido com @context do schema.org e um @graph", () => {
    for (const o of [PRIVADA, PUBLICA]) {
      const dados = JSON.parse(JSON.stringify(dadosEstruturados(o))) as No;
      expect(dados["@context"]).toBe("https://schema.org");
      expect(Array.isArray(dados["@graph"])).toBe(true);
      for (const no of grafo(o)) expect(typeof no["@type"]).toBe("string");
    }
  });

  it("SoftwareApplication com os campos pedidos", () => {
    const app = doTipo(PUBLICA, "SoftwareApplication")!;
    expect(app).toMatchObject({
      name: "ZenTrade",
      applicationCategory: "FinanceApplication",
      inLanguage: "pt-BR",
      isAccessibleForFree: true,
      license: "https://www.gnu.org/licenses/agpl-3.0.html",
      softwareVersion: "0.1.0",
      url: "https://demo.exemplo.org/",
      image: "https://demo.exemplo.org/og.png",
      offers: { "@type": "Offer", price: "0", priceCurrency: "BRL", areaServed: "BR" },
    });
    expect(app.operatingSystem).toEqual(expect.any(String));
    expect(app.description).toEqual(expect.any(String));
  });

  it("o código aponta o repositório e o software, sem organização nem pessoa inventadas", () => {
    const codigo = doTipo(PRIVADA, "SoftwareSourceCode")!;
    const app = doTipo(PRIVADA, "SoftwareApplication")!;
    expect(codigo.codeRepository).toBe(REPOSITORIO);
    expect(codigo.targetProduct).toEqual({ "@id": app["@id"] });
    expect(app.url).toBe(REPOSITORIO);
    expect(app.image).toBeUndefined();
    const tipos = JSON.stringify(dadosEstruturados(PUBLICA));
    for (const proibido of [
      "Organization",
      "Person",
      "aggregateRating",
      "review",
      "address",
      "telephone",
      "geo",
    ]) {
      expect(tipos).not.toContain(`"${proibido}`);
    }
  });

  it("WebSite só existe com endereço público", () => {
    expect(doTipo(PRIVADA, "WebSite")).toBeUndefined();
    expect(doTipo(PUBLICA, "WebSite")).toMatchObject({
      url: "https://demo.exemplo.org/",
      inLanguage: "pt-BR",
      about: { "@id": "https://demo.exemplo.org#software" },
    });
  });

  it("dentro de <script>, nenhum texto fecha a tag", () => {
    const texto = jsonParaScript({ a: "</script><script>alert(1)</script>" });
    expect(texto).not.toContain("</script");
    expect(JSON.parse(texto)).toEqual({ a: "</script><script>alert(1)</script>" });
  });
});

describe("tags do index.html", () => {
  const meta = (tags: ReturnType<typeof tagsDoBuild>, chave: string) =>
    tags.find((t) => t.attrs.name === chave || t.attrs.property === chave)?.attrs.content;

  it("privada: noindex, sem imagem nem endereço absolutos, com JSON-LD", () => {
    const tags = tagsDoBuild(PRIVADA);
    expect(meta(tags, "robots")).toBe("noindex, nofollow");
    expect(meta(tags, "og:image")).toBeUndefined();
    expect(meta(tags, "og:url")).toBeUndefined();
    expect(tags.some((t) => t.attrs.hreflang)).toBe(false);
    const ld = tags.find((t) => t.attrs.type === "application/ld+json");
    expect(JSON.parse(ld!.children!)).toEqual(dadosEstruturados(PRIVADA));
  });

  it("pública: index, imagem social absoluta 1200×630 e hreflang pt-BR", () => {
    const tags = tagsDoBuild(PUBLICA);
    expect(meta(tags, "robots")).toBe(ROBOS_PUBLICO);
    expect(meta(tags, "og:url")).toBe("https://demo.exemplo.org/");
    expect(meta(tags, "og:image")).toBe("https://demo.exemplo.org/og.png");
    expect(meta(tags, "og:image:width")).toBe("1200");
    expect(meta(tags, "og:image:height")).toBe("630");
    expect(meta(tags, "twitter:image")).toBe("https://demo.exemplo.org/og.png");
    expect(meta(tags, "og:image:alt")).toMatch(/Ensō/);
    const idiomas = tags.filter((t) => t.attrs.rel === "alternate").map((t) => t.attrs.hreflang);
    expect(idiomas).toEqual(["pt-BR", "x-default"]);
  });

  it("endereço conhecido numa instância privada: imagem absoluta, mas sem hreflang e sem indexar", () => {
    const tags = tagsDoBuild({ ...PUBLICA, publico: false });
    expect(meta(tags, "robots")).toBe("noindex, nofollow");
    expect(meta(tags, "og:image")).toBe("https://demo.exemplo.org/og.png");
    expect(tags.some((t) => t.attrs.hreflang)).toBe(false);
  });
});

describe("robots.txt e sitemap.xml", () => {
  it("privada bloqueia tudo e não tem sitemap", () => {
    expect(robotsTxt(PRIVADA)).toMatch(/User-agent: \*\nDisallow: \/\n/);
    expect(robotsTxt(PRIVADA)).not.toContain("Sitemap");
    expect(sitemapXml(PRIVADA, "2026-10-12")).toBeNull();
  });

  it("pública libera as páginas públicas, fecha a API e aponta o sitemap", () => {
    const r = robotsTxt(PUBLICA);
    expect(r).toContain("Allow: /entrar");
    expect(r).toContain("Allow: /privacidade");
    expect(r).toContain("Disallow: /api/");
    expect(r).not.toMatch(/^Disallow: \/$/m);
    expect(r).toContain("Sitemap: https://demo.exemplo.org/sitemap.xml");
  });

  it("sitemap é XML válido só com as páginas públicas", () => {
    const xml = sitemapXml(PUBLICA, "2026-10-12")!;
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    expect(doc.getElementsByTagName("parsererror")).toHaveLength(0);
    const locs = [...doc.getElementsByTagName("loc")].map((l) => l.textContent);
    expect(locs).toEqual(["https://demo.exemplo.org/entrar", "https://demo.exemplo.org/privacidade"]);
    expect([...doc.getElementsByTagName("lastmod")].every((l) => l.textContent === "2026-10-12")).toBe(true);
  });

  it("escapa o endereço no XML", () => {
    const xml = sitemapXml({ ...PUBLICA, urlPublica: "https://exemplo.org/a&b" }, "2026-10-12")!;
    expect(xml).toContain("https://exemplo.org/a&amp;b/entrar");
  });
});
