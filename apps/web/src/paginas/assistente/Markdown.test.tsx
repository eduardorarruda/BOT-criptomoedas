import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Markdown, urlSegura } from "./Markdown";

describe("urlSegura", () => {
  it("aceita só http, https e mailto", () => {
    expect(urlSegura("https://zentrade.dev/a?b=1")).toBe("https://zentrade.dev/a?b=1");
    expect(urlSegura("http://exemplo.com")).toBe("http://exemplo.com/");
    expect(urlSegura("mailto:ola@exemplo.com")).toBe("mailto:ola@exemplo.com");
  });

  it("recusa javascript:, data:, vbscript:, relativo e lixo", () => {
    for (const ruim of [
      "javascript:alert(1)",
      " JaVaScRiPt:alert(1)",
      "data:text/html,<script>1</script>",
      "vbscript:x",
      "/decisoes",
      "//outro.site/x",
      "nada de url",
      "",
    ]) {
      expect(urlSegura(ruim)).toBe("");
    }
  });
});

describe("<Markdown>", () => {
  afterEach(() => vi.restoreAllMocks());

  it("desenha títulos, listas, negrito, código em linha e tabela (GFM)", () => {
    const texto = [
      "# Resumo",
      "",
      "Seu saldo está **positivo** e o robô usa `RSI 14`.",
      "",
      "- BTC",
      "- ETH",
      "",
      "1. primeiro",
      "2. segundo",
      "",
      "| Ativo | Peso |",
      "| --- | ---: |",
      "| BTC | 60% |",
      "| ETH | 40% |",
    ].join("\n");
    const { container } = render(<Markdown texto={texto} />);
    // Título da resposta não compete com o título da página (h1).
    expect(screen.getByRole("heading", { name: "Resumo" }).tagName).toBe("H2");
    expect(screen.getByText("positivo").tagName).toBe("STRONG");
    expect(screen.getByText("RSI 14").tagName).toBe("CODE");
    expect(container.querySelectorAll("ul > li")).toHaveLength(2);
    expect(container.querySelectorAll("ol > li")).toHaveLength(2);
    const tabela = screen.getByRole("table");
    expect(
      within(tabela)
        .getAllByRole("columnheader")
        .map((c) => c.textContent),
    ).toEqual(["Ativo", "Peso"]);
    expect(within(tabela).getAllByRole("row")).toHaveLength(3);
  });

  it("nunca desenha HTML cru vindo da resposta", () => {
    const { container } = render(
      <Markdown texto={'Oi <script>alert(1)</script><img src=x onerror="alert(2)"> <b>negrito</b>'} />,
    );
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("b")).toBeNull();
    expect(container.innerHTML).not.toContain("onerror");
  });

  it("imagem em markdown vira só o texto alternativo (sem baixar nada de fora)", () => {
    const { container } = render(
      <Markdown texto="![gráfico do BTC](https://rastreador.exemplo/pixel.png)" />,
    );
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText(/gráfico do BTC/)).toBeInTheDocument();
  });

  it("link seguro abre em outra aba com rel=noopener; link perigoso vira texto", () => {
    render(
      <Markdown texto="Veja [o site](https://exemplo.com/x) e [isto](javascript:alert(1)) e [mande](mailto:a@b.co)." />,
    );
    const site = screen.getByRole("link", { name: /o site/ });
    expect(site).toHaveAttribute("href", "https://exemplo.com/x");
    expect(site).toHaveAttribute("target", "_blank");
    expect(site.getAttribute("rel")).toContain("noopener");
    expect(site.getAttribute("rel")).toContain("noreferrer");
    expect(screen.queryByRole("link", { name: "isto" })).toBeNull();
    expect(screen.getByText("isto")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /mande/ })).toHaveAttribute("href", "mailto:a@b.co");
  });

  it("bloco de código mostra a linguagem e copia o conteúdo exato", async () => {
    const usuario = userEvent.setup();
    const escrever = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
    render(<Markdown texto={"Assim:\n\n```ts\nconst rsi = 14;\nconsole.log(rsi);\n```"} />);
    expect(screen.getByText("ts")).toBeInTheDocument();
    await usuario.click(screen.getByRole("button", { name: "Copiar o código" }));
    expect(escrever).toHaveBeenCalledWith("const rsi = 14;\nconsole.log(rsi);");
    expect(await screen.findByRole("button", { name: "Código copiado" })).toBeInTheDocument();
  });

  it("texto pela metade (bloco de código ainda aberto) não quebra", () => {
    const { container } = render(<Markdown texto={"```\nmeio do cód"} />);
    expect(container.querySelector("pre code")?.textContent).toContain("meio do cód");
  });
});
