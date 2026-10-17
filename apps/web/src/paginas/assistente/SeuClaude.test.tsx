import type { EstadoAssistente, EstadoTokenClaude } from "@zentrade/contratos/esquemas";
import { configure, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { describe, expect, it, vi } from "vitest";
import { ErroApi } from "../../api/erros";
import type { Fonte } from "../../api/fonte";
import { CLAUDE_CONECTADO, CONEXAO_FALSA, metodosClaudeFalsos } from "../../teste/claudeFalso";
import { renderizar } from "../../teste/renderizar";
import type { ApiAssistente } from "./api";

configure({ asyncUtilTimeout: 10_000 });

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, className }: { children: unknown; to: string; className?: string }) => (
    <a href={to} className={className}>
      {children as never}
    </a>
  ),
}));

const { SeuClaude } = await import("./SeuClaude");

const ESTADO: EstadoAssistente = {
  config: { provedor: "api", modelo: null, contaCli: null },
  agenteNoAr: true,
  provedores: { api: true, cli: true },
  provedorPadrao: "api",
  contasCli: [],
  modelos: { api: [], cli: [] },
  tokenClaude: { usar: true, conectar: true },
  tokenClaudeFinal: null,
};
const TOKEN = `sk-ant-oat01-${"a".repeat(86)}9z9z`;

function fonte(doisFatores = true): Fonte {
  return {
    demo: false,
    obterSessao: async () => ({ id: "u1", email: "ana@exemplo.com", nome: "Ana", doisFatores }),
  } as unknown as Fonte;
}

function apiFalsa(o: { estado?: Partial<EstadoAssistente>; token?: EstadoTokenClaude } = {}) {
  const estado = { ...ESTADO, ...o.estado };
  const api = {
    estado: vi.fn(async () => estado),
    mudarConfig: vi.fn(async (m: { provedor?: "api" | "cli" }) => ({
      ...estado,
      config: { ...estado.config, ...m },
    })),
    conversas: vi.fn(),
    conversa: vi.fn(),
    criarConversa: vi.fn(),
    renomear: vi.fn(),
    apagar: vi.fn(),
    enviar: vi.fn(),
    ...metodosClaudeFalsos(o.token),
  };
  return api as typeof api & ApiAssistente;
}

const axeSemContraste = async (raiz: HTMLElement) =>
  (
    await axe.run(raiz, { rules: { "color-contrast": { enabled: false } }, resultTypes: ["violations"] })
  ).violations.map((v) => v.id);

describe("Claude Code (seu plano): conectar pelo navegador", () => {
  it("caminho feliz em três passos: link oficial, código colado, conectado, testado e em uso", async () => {
    const api = apiFalsa();
    const u = userEvent.setup();
    const { container } = renderizar(<SeuClaude api={api} />, fonte());
    const passos = await screen.findByRole("list", { name: "Passos para conectar" });
    expect(within(passos).getAllByRole("listitem")[0]).toHaveAttribute("aria-current", "step");
    expect(await axeSemContraste(container)).toEqual([]);

    await u.click(screen.getByRole("button", { name: "Conectar meu Claude" }));
    const link = await screen.findByRole("link", { name: /Abrir autorização no Claude/ });
    expect(link).toHaveAttribute("href", CONEXAO_FALSA.urlAutorizacao);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(within(passos).getAllByRole("listitem")[1]).toHaveAttribute("aria-current", "step");
    expect(screen.getByRole("timer")).toHaveTextContent(/^(10:00|9:5\d)$/);
    expect(await axeSemContraste(container)).toEqual([]);

    link.addEventListener("click", (e) => e.preventDefault());
    await u.click(link);
    expect(within(passos).getAllByRole("listitem")[2]).toHaveAttribute("aria-current", "step");
    await u.type(screen.getByLabelText(/o Claude mostra um código/), "codigo-certo#estado");
    await u.click(screen.getByRole("button", { name: "Concluir conexão" }));

    expect(await screen.findByText("Conectado", { selector: "strong" })).toBeInTheDocument();
    expect(api.enviarCodigoClaude).toHaveBeenCalledWith(CONEXAO_FALSA.conexaoId, "codigo-certo#estado");
    expect(screen.getByText("…wxyz")).toBeInTheDocument();
    await waitFor(() => expect(api.testarTokenClaude).toHaveBeenCalled());
    expect(api.mudarConfig).toHaveBeenCalledWith({ provedor: "cli", modelo: null });
    expect(container.textContent).not.toContain("sk-ant-oat01-");
  });

  it("código errado: mensagem do servidor e Tentar de novo", async () => {
    const api = apiFalsa();
    api.enviarCodigoClaude.mockRejectedValueOnce(
      new ErroApi("codigo_recusado", "O Claude não aceitou esse código.", 422),
    );
    const u = userEvent.setup();
    renderizar(<SeuClaude api={api} />, fonte());
    await u.click(await screen.findByRole("button", { name: "Conectar meu Claude" }));
    await u.type(await screen.findByLabelText(/o Claude mostra um código/), "codigo-errado#x");
    await u.click(screen.getByRole("button", { name: "Concluir conexão" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("O Claude não aceitou esse código.");
    await u.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(await screen.findByRole("link", { name: /Abrir autorização/ })).toBeInTheDocument();
    expect(api.iniciarConexaoClaude).toHaveBeenCalledTimes(2);
  });

  it("código com espaço ou caractere estranho não sai da tela", async () => {
    const api = apiFalsa();
    const u = userEvent.setup();
    renderizar(<SeuClaude api={api} />, fonte());
    await u.click(await screen.findByRole("button", { name: "Conectar meu Claude" }));
    await u.type(await screen.findByLabelText(/o Claude mostra um código/), "abc def ghi");
    await u.click(screen.getByRole("button", { name: "Concluir conexão" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/exatamente como o Claude mostrou/);
    expect(api.enviarCodigoClaude).not.toHaveBeenCalled();
  });

  it("cancelar fecha a conexão no servidor", async () => {
    const api = apiFalsa();
    const u = userEvent.setup();
    renderizar(<SeuClaude api={api} />, fonte());
    await u.click(await screen.findByRole("button", { name: "Conectar meu Claude" }));
    await u.click(await screen.findByRole("button", { name: "Cancelar" }));
    expect(api.cancelarConexaoClaude).toHaveBeenCalledWith(CONEXAO_FALSA.conexaoId);
    expect(await screen.findByRole("button", { name: "Conectar meu Claude" })).toBeInTheDocument();
  });

  it("sem 2FA: explica, leva para ligar e não deixa começar", async () => {
    const api = apiFalsa();
    renderizar(<SeuClaude api={api} />, fonte(false));
    expect(await screen.findByRole("link", { name: /Ligar o 2FA/ })).toHaveAttribute("href", "/contas");
    await waitFor(() => expect(screen.getByRole("button", { name: "Conectar meu Claude" })).toBeDisabled());
  });

  it("servidor sem a conexão pelo botão: só a opção de colar, já aberta", async () => {
    const api = apiFalsa({ estado: { tokenClaude: { usar: true, conectar: false } } });
    renderizar(<SeuClaude api={api} />, fonte());
    expect(await screen.findByLabelText("Token do Claude Code")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Conectar meu Claude" })).toBeNull();
  });

  it("servidor sem o Claude de cada pessoa: diz o que falta, sem botões", async () => {
    const api = apiFalsa({ estado: { tokenClaude: { usar: false, conectar: false } } });
    renderizar(<SeuClaude api={api} />, fonte());
    expect(await screen.findByText(/falta o Claude Code ou a ZENTRADE_CHAVE_MESTRA/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Conectar meu Claude" })).toBeNull();
    expect(screen.queryByText(/Avançado/)).toBeNull();
  });
});

describe("Claude Code (seu plano): colar o token (avançado)", () => {
  it("comando para copiar, campo de senha com mostrar/ocultar e validação do formato", async () => {
    const api = apiFalsa();
    const u = userEvent.setup();
    const { container } = renderizar(<SeuClaude api={api} />, fonte());
    await u.click(await screen.findByText(/Avançado: já tenho um token/));
    expect(screen.getByText("claude setup-token")).toBeInTheDocument();
    const campo = screen.getByLabelText("Token do Claude Code");
    expect(campo).toHaveAttribute("type", "password");
    const mostrar = screen.getByRole("button", { name: "Mostrar" });
    await u.click(mostrar);
    expect(campo).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: "Ocultar" })).toHaveAttribute("aria-pressed", "true");
    expect(await axeSemContraste(container)).toEqual([]);

    await u.type(campo, TOKEN.replace("oat01", "api03"));
    await u.click(screen.getByRole("button", { name: "Salvar token" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/chave da API/);
    expect(api.salvarTokenClaude).not.toHaveBeenCalled();

    await u.clear(campo);
    await u.type(campo, TOKEN);
    await u.click(screen.getByRole("button", { name: "Salvar token" }));
    await waitFor(() => expect(api.salvarTokenClaude).toHaveBeenCalledWith(TOKEN));
    expect(await screen.findByText("…9z9z")).toBeInTheDocument();
  });
});

describe("Claude Code (seu plano): conectado", () => {
  it("cartão com final, validade e teste; Testar, Reconectar e Remover (com confirmação)", async () => {
    const api = apiFalsa({
      estado: { config: { provedor: "cli", modelo: null, contaCli: null }, tokenClaudeFinal: "…wxyz" },
      token: CLAUDE_CONECTADO,
    });
    const u = userEvent.setup();
    const { container } = renderizar(<SeuClaude api={api} />, fonte());
    expect(await screen.findByText(/válido até/)).toBeInTheDocument();
    expect(screen.getByText(/Ainda não testado/)).toBeInTheDocument();
    expect(screen.getByText(/usam este Claude/)).toBeInTheDocument();
    expect(await axeSemContraste(container)).toEqual([]);

    await u.click(screen.getByRole("button", { name: "Testar" }));
    expect(await screen.findByText(/respondeu normalmente/)).toBeInTheDocument();

    await u.click(screen.getByRole("button", { name: "Reconectar" }));
    expect(await screen.findByRole("button", { name: "Conectar meu Claude" })).toBeInTheDocument();
    await u.click(screen.getByRole("button", { name: "Voltar" }));

    await u.click(await screen.findByRole("button", { name: "Remover" }));
    const dialogo = await screen.findByRole("dialog");
    await u.click(within(dialogo).getByRole("button", { name: "Desconectar" }));
    await waitFor(() => expect(api.removerTokenClaude).toHaveBeenCalled());
    expect(await screen.findByRole("button", { name: "Conectar meu Claude" })).toBeInTheDocument();
  });

  it("token recusado: mostra o erro e pede para reconectar", async () => {
    const api = apiFalsa({
      token: { ...CLAUDE_CONECTADO, ultimoErro: "O Claude recusou o token que você conectou." },
    });
    renderizar(<SeuClaude api={api} />, fonte());
    expect(await screen.findByText("Precisa reconectar")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("recusou o token");
  });

  it("conectado mas usando a API: oferece trocar para o próprio Claude", async () => {
    const api = apiFalsa({ token: CLAUDE_CONECTADO });
    const u = userEvent.setup();
    renderizar(<SeuClaude api={api} />, fonte());
    await u.click(await screen.findByRole("button", { name: "Usar o meu Claude" }));
    expect(api.mudarConfig).toHaveBeenCalledWith({ provedor: "cli", modelo: null });
  });
});
