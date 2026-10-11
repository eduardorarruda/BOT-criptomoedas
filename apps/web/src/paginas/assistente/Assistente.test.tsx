import type { EstadoAssistente, EventoChat, MensagemAssistente } from "@zentrade/contratos/esquemas";
import { configure, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Fonte } from "../../api/fonte";
import { renderizar } from "../../teste/renderizar";
import type { ApiAssistente } from "./api";

// Sob carga (turbo rodando tudo junto), a resposta em streaming pode passar de 1 s.
configure({ asyncUtilTimeout: 10_000 });

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: unknown; to: string }) => <a href={to}>{children as never}</a>,
}));

const { Assistente } = await import("./Assistente");
const { Configuracoes } = await import("./Configuracoes");

const fonte = { demo: false } as Fonte;
const ESTADO: EstadoAssistente = {
  config: { provedor: "api", modelo: null, contaCli: null },
  agenteNoAr: true,
  provedores: { api: true, cli: true },
  provedorPadrao: "api",
  contasCli: [{ id: "pessoal", nome: "pessoal", logada: false }],
  modelos: {
    api: [{ id: "claude-opus-5", nome: "Opus 5", descricao: "padrão" }],
    cli: [{ id: "sonnet", nome: "Sonnet", descricao: "rápido" }],
  },
};

const msg = (
  id: string,
  papel: "usuario" | "assistente",
  texto: string,
  extra: Partial<MensagemAssistente> = {},
): MensagemAssistente => ({
  id,
  papel,
  texto,
  fontes: [],
  ferramentas: [],
  situacao: "ok",
  erro: null,
  provedor: papel === "assistente" ? "api" : null,
  modelo: null,
  criadaEm: Date.UTC(2026, 9, 10, 12),
  ...extra,
});

/** API de mentira com memória: o que a resposta grava volta ao recarregar a conversa. */
function apiFalsa(eventos: EventoChat[]): ApiAssistente {
  const gravadas: MensagemAssistente[] = [];
  return {
    estado: vi.fn(async () => ESTADO),
    mudarConfig: vi.fn(async (m) => ({
      ...ESTADO,
      config: { ...ESTADO.config, ...m } as EstadoAssistente["config"],
    })),
    conversas: vi.fn(async () => []),
    conversa: vi.fn(async (id: string) => ({
      id,
      titulo: "Nova conversa",
      previa: "",
      criadaEm: 1,
      atualizadaEm: 1,
      mensagens: [...gravadas],
    })),
    criarConversa: vi.fn(async () => ({
      id: "c1",
      titulo: "Nova conversa",
      previa: "",
      criadaEm: 1,
      atualizadaEm: 1,
    })),
    renomear: vi.fn(),
    apagar: vi.fn(async () => undefined),
    async *enviar() {
      for (const e of eventos) {
        if (e.tipo === "inicio") gravadas.push(e.usuario);
        if (e.tipo === "fim") gravadas.push(e.mensagem);
        yield e;
      }
    },
  };
}

describe("tela do Assistente", () => {
  it("cria a conversa na primeira pergunta e mostra a resposta com ferramentas e fontes", async () => {
    const final = msg("a1", "assistente", "Hoje o resultado foi **zero**.", {
      ferramentas: [{ nome: "resumo_da_conta", descricao: "Lendo o resumo da sua conta" }],
      fontes: [{ tipo: "nota", id: "n1", titulo: "Meu plano", url: "https://exemplo.com" }],
    });
    const api = apiFalsa([
      { tipo: "inicio", usuario: msg("u1", "usuario", "Como foi o meu dia hoje?") },
      { tipo: "ferramenta", nome: "resumo_da_conta", descricao: "Lendo o resumo da sua conta" },
      { tipo: "texto", delta: "Hoje o resultado foi **zero**." },
      { tipo: "fim", mensagem: final },
    ]);
    renderizar(<Assistente api={api} />, fonte);
    expect(await screen.findByText(/Respondendo com Claude pela API/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Como foi o meu dia hoje?" }));
    expect(api.criarConversa).toHaveBeenCalled();
    expect(await screen.findByText("zero")).toBeInTheDocument();
    expect(screen.getByText("Lendo o resumo da sua conta")).toBeInTheDocument();
    expect(screen.getByText(/1 fonte consultada/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Meu plano/ })).toHaveAttribute("href", "https://exemplo.com/");
    expect(screen.getByText(/não é recomendação de investimento/i)).toBeInTheDocument();
  });

  it("mostra a resposta com erro gravada e permite digitar a pergunta", async () => {
    const api = apiFalsa([
      {
        tipo: "fim",
        mensagem: msg("a2", "assistente", "", { situacao: "erro", erro: "Faça o login de novo." }),
      },
    ]);
    renderizar(<Assistente api={api} />, fonte);
    const caixa = await screen.findByLabelText("Sua pergunta");
    await userEvent.type(caixa, "oi{Enter}");
    expect(await screen.findByText("Faça o login de novo.")).toBeInTheDocument();
  });

  it("no modo de demonstração explica que precisa da API", () => {
    renderizar(<Assistente api={apiFalsa([])} />, { demo: true } as Fonte);
    expect(screen.getByText(/Indisponível no modo de demonstração/)).toBeInTheDocument();
  });
});

describe("Assistente → Configurações", () => {
  it("troca para o Claude Code com conta e modelo, e salva", async () => {
    const api = apiFalsa([]);
    renderizar(<Configuracoes api={api} />, fonte);
    await userEvent.click(await screen.findByRole("radio", { name: /Claude Code/ }));
    await userEvent.selectOptions(screen.getByLabelText("Modelo"), "sonnet");
    await userEvent.selectOptions(screen.getByLabelText("Conta do Claude Code"), "pessoal");
    expect(screen.getByText(/ainda não tem login/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() =>
      expect(api.mudarConfig).toHaveBeenCalledWith({
        provedor: "cli",
        modelo: "sonnet",
        contaCli: "pessoal",
      }),
    );
    expect(screen.getByText(/termos de uso da Anthropic/)).toBeInTheDocument();
  });

  it("modelo digitado à mão é validado", async () => {
    const api = apiFalsa([]);
    renderizar(<Configuracoes api={api} />, fonte);
    await userEvent.selectOptions(await screen.findByLabelText("Modelo"), "__outro");
    await userEvent.type(screen.getByLabelText("Nome do modelo"), "-p");
    expect(screen.getByText(/sem começar com -/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(api.mudarConfig).not.toHaveBeenCalled();
  });
});
