import { screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  abrirSemSessao,
  esperarTitulo,
  fonteDeInstancia,
  niveisDeTitulo,
  saltosDeNivel,
} from "../../teste/publicas";
import { ID_DADOS_PRIVACIDADE } from "../Privacidade";
import { dadosEstruturadosPrivacidade, PERGUNTAS, SECOES } from "./dados";

afterEach(() => window.history.pushState({}, "", "/"));

describe("/privacidade", () => {
  it("abre sem login e não manda para a tela de entrar", async () => {
    abrirSemSessao("/privacidade");
    await esperarTitulo(/política de privacidade/i);
    expect(window.location.pathname).toBe("/privacidade");
    expect(document.title).toBe("Política de privacidade · ZenTrade");
    expect(document.head.querySelector('meta[name="robots"]')?.getAttribute("content")).toBe(
      "noindex, nofollow",
    );
  });

  it("tem um só h1 e os títulos descem um nível por vez", async () => {
    abrirSemSessao("/privacidade");
    await esperarTitulo(/política de privacidade/i);
    await screen.findByText(/modo de exemplo/i);
    const niveis = niveisDeTitulo();
    expect(niveis.filter((n) => n === 1)).toHaveLength(1);
    expect(niveis[0]).toBe(1);
    expect(saltosDeNivel(niveis)).toEqual([]);
  });

  it("o sumário leva a todas as seções", async () => {
    abrirSemSessao("/privacidade");
    await esperarTitulo(/política de privacidade/i);
    const sumario = screen.getByRole("navigation", { name: /sumário/i });
    const links = within(sumario).getAllByRole("link");
    expect(links).toHaveLength(SECOES.length);
    for (const link of links) {
      const alvo = document.getElementById(link.getAttribute("href")!.slice(1));
      expect(alvo?.tagName).toBe("H2");
      expect(alvo).toHaveTextContent(link.textContent!);
    }
  });

  it("cobre os fluxos de dados e as bases legais que o código tem", async () => {
    abrirSemSessao("/privacidade");
    await esperarTitulo(/política de privacidade/i);
    const texto = document.body.textContent!;
    for (const termo of [
      "Argon2id",
      "AES-256-GCM",
      "Binance",
      "Pluggy",
      "Anthropic",
      "Claude Code",
      "Voyage AI",
      "Ollama",
      "Telegram",
      "Banco Central",
      "art. 7º, I",
      "art. 7º, II",
      "art. 7º, V",
      "art. 7º, IX",
      "art. 33",
      "art. 18",
      "Row Level Security",
      "zt_sessao",
      "zt_csrf",
      "menores de 18 anos",
      "Última atualização",
    ]) {
      expect(texto, termo).toContain(termo);
    }
  });

  it("põe o FAQPage no <head> enquanto a página está aberta", async () => {
    const { unmount } = abrirSemSessao("/privacidade");
    await esperarTitulo(/política de privacidade/i);
    const script = document.getElementById(ID_DADOS_PRIVACIDADE);
    expect(script?.getAttribute("type")).toBe("application/ld+json");
    const dados = JSON.parse(script!.textContent!) as ReturnType<typeof dadosEstruturadosPrivacidade>;
    const faq = dados["@graph"].find((n) => n["@type"] === "FAQPage") as {
      mainEntity: { name: string; acceptedAnswer: { text: string } }[];
    };
    expect(faq.mainEntity.map((q) => q.name)).toEqual(PERGUNTAS.map((p) => p.titulo));
    // As perguntas do JSON-LD são as que a página mostra.
    for (const p of PERGUNTAS)
      expect(screen.getByRole("heading", { level: 3, name: p.titulo })).toBeInTheDocument();
    unmount();
    expect(document.getElementById(ID_DADOS_PRIVACIDADE)).toBeNull();
  });

  it("instância com controlador configurado mostra o contato", async () => {
    abrirSemSessao(
      "/privacidade",
      fonteDeInstancia({
        controlador: { nome: "Ana Exemplo", email: "privacidade@exemplo.com" },
        encarregado: { nome: "Bruno DPO", email: "dpo@exemplo.com" },
      }),
    );
    await esperarTitulo(/política de privacidade/i);
    expect(await screen.findByRole("link", { name: "privacidade@exemplo.com" })).toHaveAttribute(
      "href",
      "mailto:privacidade@exemplo.com",
    );
    expect(screen.getByText(/Bruno DPO/)).toBeInTheDocument();
    expect(screen.queryByText(/aviso para quem opera/i)).toBeNull();
  });

  it("sem encarregado, o controlador atende", async () => {
    abrirSemSessao(
      "/privacidade",
      fonteDeInstancia({ controlador: { nome: "Ana Exemplo", email: "privacidade@exemplo.com" } }),
    );
    await esperarTitulo(/política de privacidade/i);
    expect(await screen.findByText(/o próprio controlador atende/i)).toBeInTheDocument();
  });

  it("instância sem controlador avisa quem opera, e só nesse caso", async () => {
    abrirSemSessao("/privacidade", fonteDeInstancia());
    await esperarTitulo(/política de privacidade/i);
    const aviso = await screen.findByRole("note");
    expect(aviso).toHaveTextContent(/aviso para quem opera esta instância/i);
    expect(aviso).toHaveTextContent("ZENTRADE_CONTROLADOR_EMAIL");
  });

  it("se a API não responde, diz isso em vez de inventar um contato", async () => {
    const fonte = { ...fonteDeInstancia(), configPublica: () => Promise.reject(new Error("fora do ar")) };
    abrirSemSessao("/privacidade", fonte);
    await esperarTitulo(/política de privacidade/i);
    // A aplicação tenta de novo duas vezes antes de desistir.
    expect(
      await screen.findByText(/não foi possível carregar o contato/i, undefined, { timeout: 10_000 }),
    ).toBeInTheDocument();
  });
});
