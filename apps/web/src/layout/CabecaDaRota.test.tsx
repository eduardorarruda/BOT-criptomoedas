import { afterEach, describe, expect, it } from "vitest";
import { ROBOS_PRIVADO, ROBOS_PUBLICO, type OpcoesSeo } from "../lib/cabeca";
import { aplicarCabeca, cabecaDe, opcoesDoBuild } from "./CabecaDaRota";

const PRIVADA: OpcoesSeo = { publico: false, versao: "0.1.0" };
const PUBLICA: OpcoesSeo = { publico: true, versao: "0.1.0", urlPublica: "https://demo.exemplo.org" };

const conteudo = (seletor: string): string | null | undefined =>
  document.head.querySelector(seletor)?.getAttribute("content");

afterEach(() => {
  document.head.innerHTML = "";
  document.title = "";
});

describe("cabeça de cada rota", () => {
  it("título das páginas públicas e das telas do menu", () => {
    expect(cabecaDe("/entrar", PRIVADA).titulo).toBe("Entrar · ZenTrade");
    expect(cabecaDe("/privacidade", PRIVADA).titulo).toBe("Política de privacidade · ZenTrade");
    expect(cabecaDe("/", PRIVADA).titulo).toBe("Visão geral · ZenTrade");
    expect(cabecaDe("/robos", PRIVADA).titulo).toBe("Robôs · ZenTrade");
    expect(cabecaDe("/imobiliario/novo", PRIVADA).titulo).toBe("Imobiliário · ZenTrade");
    expect(cabecaDe("/assistente/configuracoes", PRIVADA).titulo).toBe("Assistente · ZenTrade");
    expect(cabecaDe("/nao-existe", PRIVADA).titulo).toBe("ZenTrade");
  });

  it("descrição própria nas páginas públicas", () => {
    expect(cabecaDe("/privacidade", PRIVADA).descricao).toMatch(/LGPD/);
    expect(cabecaDe("/robos", PRIVADA).descricao).toMatch(/auto-hospedado/);
  });

  it("privada: noindex e sem canônico em todas as rotas", () => {
    for (const caminho of ["/entrar", "/privacidade", "/", "/carteira"]) {
      const c = cabecaDe(caminho, PRIVADA);
      expect(c.robos).toBe(ROBOS_PRIVADO);
      expect(c.canonico).toBeUndefined();
    }
  });

  it("pública: indexa e canoniza só o login e a privacidade", () => {
    expect(cabecaDe("/entrar", PUBLICA)).toMatchObject({
      robos: ROBOS_PUBLICO,
      canonico: "https://demo.exemplo.org/entrar",
    });
    expect(cabecaDe("/carteira", PUBLICA)).toMatchObject({ robos: ROBOS_PRIVADO });
    expect(cabecaDe("/carteira", PUBLICA).canonico).toBeUndefined();
  });
});

describe("aplicar no <head>", () => {
  it("cria título, descrição, robôs, Open Graph e Twitter", () => {
    aplicarCabeca(document, cabecaDe("/entrar", PRIVADA));
    expect(document.title).toBe("Entrar · ZenTrade");
    expect(conteudo('meta[name="robots"]')).toBe(ROBOS_PRIVADO);
    expect(conteudo('meta[name="description"]')).toMatch(/Entre no ZenTrade/);
    expect(conteudo('meta[property="og:title"]')).toBe("Entrar · ZenTrade");
    expect(conteudo('meta[name="twitter:description"]')).toMatch(/Entre no ZenTrade/);
    expect(document.head.querySelector('link[rel="canonical"]')).toBeNull();
  });

  it("atualiza as mesmas tags ao trocar de rota e tira o canônico quando a rota não tem", () => {
    aplicarCabeca(document, cabecaDe("/entrar", PUBLICA));
    aplicarCabeca(document, cabecaDe("/privacidade", PUBLICA));
    expect(document.head.querySelectorAll('meta[name="description"]')).toHaveLength(1);
    expect(document.head.querySelectorAll('link[rel="canonical"]')).toHaveLength(1);
    expect(document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href).toBe(
      "https://demo.exemplo.org/privacidade",
    );
    expect(conteudo('meta[property="og:url"]')).toBe("https://demo.exemplo.org/privacidade");

    aplicarCabeca(document, cabecaDe("/robos", PUBLICA));
    expect(document.head.querySelector('link[rel="canonical"]')).toBeNull();
    expect(conteudo('meta[name="robots"]')).toBe(ROBOS_PRIVADO);
  });
});

describe("opções do build na tela", () => {
  it("lê as variáveis e, se inválidas, cai para privada em vez de quebrar a tela", () => {
    expect(opcoesDoBuild({})).toMatchObject({ publico: false });
    expect(opcoesDoBuild({ VITE_PUBLICO: "1", VITE_URL_PUBLICA: "https://demo.exemplo.org" })).toMatchObject({
      publico: true,
      urlPublica: "https://demo.exemplo.org",
    });
    expect(opcoesDoBuild({ VITE_PUBLICO: "1" })).toMatchObject({ publico: false });
    expect(opcoesDoBuild().versao).toBe(__ZENTRADE_VERSAO__);
  });
});
