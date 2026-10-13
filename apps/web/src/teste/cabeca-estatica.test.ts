import { existsSync, readFileSync, statSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * O que vai no index.html e em public/ sem depender do build: meta tags, ícones,
 * manifesto, imagem social e o llms.txt. O que depende do build está em lib/cabeca.
 */
// No jsdom, import.meta.url não é file://; os testes rodam da pasta do pacote (apps/web).
const web = pathToFileURL(`${process.cwd()}/`);
const publico = new URL("public/", web);
const ler = (url: URL): string => readFileSync(url, "utf8");
const html = new DOMParser().parseFromString(ler(new URL("index.html", web)), "text/html");

const meta = (seletor: string): string | null => html.querySelector(seletor)?.getAttribute("content") ?? null;
const LIMITE_IMAGEM_SOCIAL = 300 * 1024;

describe("index.html", () => {
  it("nenhum script inline executável: a CSP (script-src 'self') bloquearia", () => {
    const inline = [...html.querySelectorAll("script")].filter(
      (s) => !s.getAttribute("src") && s.getAttribute("type") !== "application/ld+json",
    );
    expect(inline).toHaveLength(0);
    // O tema salvo é aplicado antes do primeiro desenho por um arquivo da própria origem.
    const tema = html.querySelector('head script[src="/tema.js"]');
    expect(tema?.hasAttribute("type") || tema?.hasAttribute("defer") || tema?.hasAttribute("async")).toBe(
      false,
    );
    expect(ler(new URL("tema.js", publico))).toContain("zentrade:tema");
  });

  it("idioma, título único e descrição", () => {
    expect(html.documentElement.lang).toBe("pt-BR");
    expect(html.querySelectorAll("title")).toHaveLength(1);
    expect(html.title).toBe("ZenTrade");
    const descricao = meta('meta[name="description"]')!;
    expect(descricao.length).toBeGreaterThan(70);
    expect(descricao.length).toBeLessThanOrEqual(160);
  });

  it("Open Graph e Twitter, em português do Brasil", () => {
    expect(meta('meta[property="og:type"]')).toBe("website");
    expect(meta('meta[property="og:site_name"]')).toBe("ZenTrade");
    expect(meta('meta[property="og:locale"]')).toBe("pt_BR");
    expect(meta('meta[property="og:title"]')).toBe("ZenTrade");
    expect(meta('meta[property="og:description"]')).toBe(meta('meta[name="description"]'));
    expect(meta('meta[name="twitter:card"]')).toBe("summary_large_image");
  });

  it("geografia honesta: só o país e o idioma (sem endereço, telefone nem coordenadas)", () => {
    expect(meta('meta[name="geo.region"]')).toBe("BR");
    expect(meta('meta[http-equiv="content-language"]')).toBe("pt-BR");
    for (const inventado of ["geo.position", "ICBM", "geo.placename"]) {
      expect(html.querySelector(`meta[name="${inventado}"]`)).toBeNull();
    }
  });

  it("robots fica para o build: o index.html não decide sozinho", () => {
    expect(html.querySelector('meta[name="robots"]')).toBeNull();
  });

  it("ícones e manifesto apontam para arquivos que existem", () => {
    const links = [
      ...html.querySelectorAll('link[rel="icon"], link[rel="apple-touch-icon"], link[rel="manifest"]'),
    ];
    expect(links.map((l) => l.getAttribute("href"))).toEqual([
      "/simbolo.svg",
      "/favicon-32.png",
      "/apple-touch-icon.png",
      "/manifest.webmanifest",
    ]);
    for (const l of links) expect(existsSync(new URL(`.${l.getAttribute("href")}`, publico))).toBe(true);
    expect(html.querySelector('meta[name="theme-color"]')).not.toBeNull();
  });
});

describe("manifesto", () => {
  const manifesto = JSON.parse(ler(new URL("manifest.webmanifest", publico))) as {
    name: string;
    lang: string;
    start_url: string;
    display: string;
    icons: { src: string; sizes: string; type: string }[];
  };

  it("nome, idioma e ícones que existem (192 e 512 para instalar)", () => {
    expect(manifesto).toMatchObject({
      name: "ZenTrade",
      lang: "pt-BR",
      start_url: "/",
      display: "standalone",
    });
    for (const icone of manifesto.icons) expect(existsSync(new URL(`.${icone.src}`, publico))).toBe(true);
    expect(manifesto.icons.map((i) => i.sizes)).toEqual(expect.arrayContaining(["192x192", "512x512"]));
  });
});

/** Largura e altura do PNG, lidas do cabeçalho IHDR. */
function dimensoesPng(arquivo: URL): [number, number] {
  const b = readFileSync(arquivo);
  expect(b.subarray(1, 4).toString("ascii")).toBe("PNG");
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

describe("imagem social", () => {
  it("PNG 1200×630 com menos de 300 KB", () => {
    const png = new URL("og.png", publico);
    expect(dimensoesPng(png)).toEqual([1200, 630]);
    expect(statSync(png).size).toBeLessThan(LIMITE_IMAGEM_SOCIAL);
  });

  it("WebP de verdade, com menos de 300 KB", () => {
    const webp = readFileSync(new URL("og.webp", publico));
    expect(webp.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(webp.subarray(8, 12).toString("ascii")).toBe("WEBP");
    expect(webp.length).toBeLessThan(LIMITE_IMAGEM_SOCIAL);
  });

  it("ícones nos tamanhos declarados", () => {
    expect(dimensoesPng(new URL("apple-touch-icon.png", publico))).toEqual([180, 180]);
    expect(dimensoesPng(new URL("favicon-32.png", publico))).toEqual([32, 32]);
    expect(dimensoesPng(new URL("icone-192.png", publico))).toEqual([192, 192]);
    expect(dimensoesPng(new URL("icone-512.png", publico))).toEqual([512, 512]);
  });
});

describe("llms.txt", () => {
  const texto = ler(new URL("llms.txt", publico));

  it("segue a convenção: título, resumo em citação e seções com links", () => {
    expect(texto.startsWith("# ZenTrade\n")).toBe(true);
    expect(texto).toMatch(/^> .+/m);
    expect(texto).toMatch(/^## Documentação$/m);
    expect(texto).toMatch(/^## Optional$/m);
    const links = [...texto.matchAll(/\]\((https:\/\/[^)]+)\)/g)].map((m) => m[1]);
    expect(links.length).toBeGreaterThan(5);
    expect(links).toContain(
      "https://github.com/eduardorarruda/BOT-criptomoedas/blob/main/docs/fundamentacao.md",
    );
  });

  it("diz o que não é e o modelo de segurança", () => {
    expect(texto).toMatch(/Não é promessa de lucro/);
    expect(texto).toMatch(/recomendação/);
    expect(texto).toMatch(/Regras decidem, a IA argumenta, o risco tem a palavra final/);
    expect(texto).toMatch(/Parada total/);
    expect(texto).toMatch(/AGPL-3\.0/);
  });

  it("os links para docs/ apontam para arquivos que existem no repositório", () => {
    const raiz = new URL("../../", web);
    const docs = [...texto.matchAll(/blob\/main\/([^)]+)\)/g)].map((m) => m[1]!);
    for (const caminho of docs) expect(existsSync(new URL(caminho, raiz)), caminho).toBe(true);
  });

  it("o da raiz do repositório é o mesmo da tela", () => {
    expect(ler(new URL("../../llms.txt", web))).toBe(texto);
  });
});
