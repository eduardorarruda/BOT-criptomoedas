import type {
  ConversaResumo,
  EstadoAssistente,
  EventoChat,
  MensagemAssistente,
} from "@zentrade/contratos/esquemas";
import { configure, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { describe, expect, it, vi } from "vitest";
import { ErroApi } from "../../api/erros";
import type { Fonte } from "../../api/fonte";
import { metodosClaudeFalsos } from "../../teste/claudeFalso";
import { renderizar } from "../../teste/renderizar";
import type { ApiAssistente } from "./api";

// Sob carga (turbo rodando tudo junto), a resposta em streaming pode passar de 1 s.
configure({ asyncUtilTimeout: 10_000 });

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, className }: { children: unknown; to: string; className?: string }) => (
    <a href={to} className={className}>
      {children as never}
    </a>
  ),
}));

const { Assistente } = await import("./Assistente");
const { Configuracoes } = await import("./Configuracoes");

const fonte = { demo: false } as Fonte;
const AGORA = Date.now();
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
  criadaEm: AGORA,
  ...extra,
});

const resumo = (id: string, titulo: string, atualizadaEm = AGORA): ConversaResumo => ({
  id,
  titulo,
  previa: "",
  criadaEm: atualizadaEm,
  atualizadaEm,
});

type Roteiro = (pergunta: string, sinal: AbortSignal) => AsyncGenerator<EventoChat>;

/** Resposta pronta em sequência; a mensagem final é gravada (volta ao recarregar a conversa). */
function roteiroSimples(eventos: EventoChat[]): Roteiro {
  return async function* () {
    for (const e of eventos) yield e;
  };
}

/** API de mentira com memória: o que a resposta grava volta ao recarregar a conversa. */
function apiFalsa(
  roteiro: Roteiro,
  opcoes: { conversas?: ConversaResumo[]; estado?: EstadoAssistente } = {},
) {
  const gravadas = new Map<string, MensagemAssistente[]>();
  let conversas = [...(opcoes.conversas ?? [])];
  const api = {
    estado: vi.fn(async () => opcoes.estado ?? ESTADO),
    mudarConfig: vi.fn(async (m) => ({
      ...ESTADO,
      config: { ...ESTADO.config, ...m } as EstadoAssistente["config"],
    })),
    conversas: vi.fn(async () => conversas),
    conversa: vi.fn(async (id: string) => ({
      ...(conversas.find((c) => c.id === id) ?? resumo(id, "Nova conversa")),
      mensagens: [...(gravadas.get(id) ?? [])],
    })),
    criarConversa: vi.fn(async () => {
      const c = resumo("c-nova", "Nova conversa");
      conversas = [c, ...conversas];
      return c;
    }),
    renomear: vi.fn(async (id: string, titulo: string) => {
      conversas = conversas.map((c) => (c.id === id ? { ...c, titulo } : c));
      return conversas.find((c) => c.id === id) ?? resumo(id, titulo);
    }),
    apagar: vi.fn(async (id: string) => {
      conversas = conversas.filter((c) => c.id !== id);
    }),
    enviar: vi.fn(async function* (conversaId: string, texto: string, sinal: AbortSignal) {
      for await (const e of roteiro(texto, sinal)) {
        const lista = gravadas.get(conversaId) ?? [];
        if (e.tipo === "inicio") gravadas.set(conversaId, [...lista, e.usuario]);
        if (e.tipo === "fim") gravadas.set(conversaId, [...lista, e.mensagem]);
        yield e;
      }
    }),
    gravar: (id: string, mensagens: MensagemAssistente[]) => gravadas.set(id, mensagens),
    ...metodosClaudeFalsos(),
  };
  return api satisfies ApiAssistente;
}

/** Evento que só sai quando o teste mandar (ou some se a resposta for parada). */
function controlavel() {
  let soltar: () => void = () => undefined;
  const roteiro: Roteiro = async function* (pergunta, sinal) {
    yield { tipo: "inicio", usuario: msg("u1", "usuario", pergunta) };
    yield { tipo: "ferramenta", nome: "carteira_cripto", descricao: "Lendo a sua carteira de cripto" };
    await new Promise<void>((r) => {
      soltar = r;
      sinal.addEventListener("abort", () => r());
    });
    if (sinal.aborted) return;
    yield { tipo: "texto", delta: "Metade da resposta" };
  };
  return { roteiro, soltar: () => soltar() };
}

const OPCOES_AXE: axe.RunOptions = {
  rules: { "color-contrast": { enabled: false } },
  resultTypes: ["violations"],
};
async function violacoes(): Promise<string[]> {
  const r = await axe.run(document.body, OPCOES_AXE);
  return r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html.slice(0, 120)).join(" | ")}`);
}

describe("Assistente: começo de conversa", () => {
  it("mostra a saudação, as sugestões e o aviso; a sugestão vira pergunta e a resposta aparece completa", async () => {
    const final = msg("a1", "assistente", "## Carteira\n\nO saldo está **positivo**.", {
      ferramentas: [{ nome: "carteira_cripto", descricao: "Lendo a sua carteira de cripto" }],
      fontes: [{ tipo: "nota", id: "n1", titulo: "Meu plano", url: "https://exemplo.com" }],
    });
    const api = apiFalsa(
      roteiroSimples([
        { tipo: "inicio", usuario: msg("u1", "usuario", "Resumo da minha carteira cripto") },
        { tipo: "ferramenta", nome: "carteira_cripto", descricao: "Lendo a sua carteira de cripto" },
        { tipo: "texto", delta: final.texto },
        { tipo: "fontes", fontes: final.fontes },
        { tipo: "fim", mensagem: final },
      ]),
    );
    renderizar(<Assistente api={api} />, fonte);
    expect(screen.getByRole("heading", { level: 1, name: "Assistente" })).toBeInTheDocument();
    expect(
      await screen.findByRole("heading", { name: /^(Bom dia|Boa tarde|Boa noite)/ }),
    ).toBeInTheDocument();
    expect(screen.getByText(/não é recomendação de investimento/i)).toBeInTheDocument();
    const sugestoes = within(screen.getByRole("list", { name: "Sugestões" })).getAllByRole("button");
    expect(sugestoes).toHaveLength(4);

    await userEvent.click(screen.getByRole("button", { name: "Resumo da minha carteira cripto" }));
    expect(api.criarConversa).toHaveBeenCalled();
    expect(await screen.findByText("positivo")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Carteira" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Lendo a sua carteira de cripto/ })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.getByRole("link", { name: /Meu plano/ })).toHaveAttribute("href", "https://exemplo.com/");
    expect(await screen.findByText("Resposta pronta.")).toBeInTheDocument();
    expect(await violacoes()).toEqual([]);
  });

  it("sem provedor de IA a caixa fica desligada e diz por quê", async () => {
    const api = apiFalsa(roteiroSimples([]), {
      estado: { ...ESTADO, provedores: { api: false, cli: false } },
    });
    renderizar(<Assistente api={api} />, fonte);
    const caixa = screen.getByRole("textbox", { name: "Sua pergunta" });
    await waitFor(() => expect(caixa).toBeDisabled());
    expect(caixa).toHaveAccessibleDescription(/Nenhum provedor de IA/);
  });

  it("o seletor do rodapé troca para o Claude Code", async () => {
    const api = apiFalsa(roteiroSimples([]));
    renderizar(<Assistente api={api} />, fonte);
    await userEvent.click(await screen.findByRole("button", { name: /Quem responde: Claude pela API/ }));
    await userEvent.click(screen.getByRole("radio", { name: /Claude Code/ }));
    await waitFor(() => expect(api.mudarConfig).toHaveBeenCalledWith({ provedor: "cli", modelo: null }));
    expect(screen.getByRole("link", { name: /Mais configurações/ })).toHaveAttribute(
      "href",
      "/assistente/configuracoes",
    );
    expect(await violacoes()).toEqual([]);
  });
});

describe("Assistente: resposta em andamento", () => {
  it("mostra a etapa rodando, troca Enviar por Parar, e Parar interrompe", async () => {
    const { roteiro } = controlavel();
    const api = apiFalsa(roteiro);
    renderizar(<Assistente api={api} />, fonte);
    await userEvent.type(
      screen.getByRole("textbox", { name: "Sua pergunta" }),
      "Como estão meus robôs?{Enter}",
    );
    expect(await screen.findByText("Como estão meus robôs?")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /Lendo a sua carteira de cripto/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Parar a resposta" }));
    expect(await screen.findByText("Resposta interrompida.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enviar" })).toBeInTheDocument();
  });

  it("Esc também para a resposta", async () => {
    const { roteiro } = controlavel();
    renderizar(<Assistente api={apiFalsa(roteiro)} />, fonte);
    await userEvent.type(screen.getByRole("textbox", { name: "Sua pergunta" }), "oi{Enter}");
    await screen.findByRole("button", { name: "Parar a resposta" });
    await userEvent.keyboard("{Escape}");
    expect(await screen.findByText("Resposta interrompida.")).toBeInTheDocument();
  });

  it("falha de rede vira aviso amigável com Tentar de novo, que repete a pergunta", async () => {
    let vez = 0;
    const api = apiFalsa(async function* (pergunta) {
      vez++;
      if (vez === 1) throw new ErroApi("sem_conexao", "Sem conexão com o servidor.", 0);
      yield { tipo: "inicio", usuario: msg("u2", "usuario", pergunta) };
      yield { tipo: "texto", delta: "Agora foi." };
      yield { tipo: "fim", mensagem: msg("a2", "assistente", "Agora foi.") };
    });
    renderizar(<Assistente api={api} />, fonte);
    await userEvent.type(screen.getByRole("textbox", { name: "Sua pergunta" }), "Quanto rendeu?{Enter}");
    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent("Sem conexão com o servidor.");
    await userEvent.click(within(alerta).getByRole("button", { name: "Tentar de novo" }));
    expect(await screen.findByText("Agora foi.")).toBeInTheDocument();
    expect(api.enviar).toHaveBeenLastCalledWith("c-nova", "Quanto rendeu?", expect.any(AbortSignal));
  });
});

describe("Assistente: resposta em outra conversa", () => {
  it("trocar de conversa no meio da resposta libera a caixa da outra e o Esc não para a primeira", async () => {
    const { roteiro } = controlavel();
    const api = apiFalsa(roteiro, { conversas: [resumo("c1", "Carteira cripto")] });
    renderizar(<Assistente api={api} />, fonte);
    await userEvent.type(screen.getByRole("textbox", { name: "Sua pergunta" }), "oi{Enter}");
    await screen.findByRole("button", { name: "Parar a resposta" });
    const lateral = screen.getByRole("navigation", { name: "Conversas" });
    await userEvent.click(await within(lateral).findByRole("button", { name: "Carteira cripto" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Carteira cripto" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Parar a resposta" })).toBeNull();
    await userEvent.keyboard("{Escape}");
    // Volta para a conversa que estava respondendo (o item da lista, não o botão de nova conversa).
    const [, itemDaPrimeira] = within(lateral).getAllByRole("button", { name: "Nova conversa" });
    await userEvent.click(itemDaPrimeira as HTMLElement);
    expect(await screen.findByRole("button", { name: /Lendo a sua carteira de cripto/ })).toBeInTheDocument();
    expect(screen.queryByText("Resposta interrompida.")).toBeNull();
  });
});

describe("Assistente: conversas", () => {
  const lista = [
    resumo("c1", "Carteira cripto"),
    resumo("c2", "Títulos de renda fixa", AGORA - 3 * 86_400_000),
    resumo("c3", "Taxas de saque", AGORA - 40 * 86_400_000),
  ];

  it("agrupa por data, abre uma conversa e regenera a última resposta", async () => {
    const api = apiFalsa(
      roteiroSimples([
        { tipo: "inicio", usuario: msg("u9", "usuario", "Quanto tenho?") },
        { tipo: "texto", delta: "De novo." },
        { tipo: "fim", mensagem: msg("a9", "assistente", "De novo.") },
      ]),
      { conversas: lista },
    );
    api.gravar("c1", [msg("u0", "usuario", "Quanto tenho?"), msg("a0", "assistente", "Você tem **R$ 10**.")]);
    renderizar(<Assistente api={api} />, fonte);
    const lateral = screen.getByRole("navigation", { name: "Conversas" });
    expect(await within(lateral).findByRole("heading", { name: "Hoje" })).toBeInTheDocument();
    expect(within(lateral).getByRole("heading", { name: "Últimos 7 dias" })).toBeInTheDocument();
    expect(within(lateral).getByRole("heading", { name: "Mais antigas" })).toBeInTheDocument();

    await userEvent.click(within(lateral).getByRole("button", { name: "Carteira cripto" }));
    expect(await screen.findByText("R$ 10")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Carteira cripto" })).toBeInTheDocument();
    expect(within(lateral).getByRole("button", { name: "Carteira cripto" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(await violacoes()).toEqual([]);

    await userEvent.click(screen.getByRole("button", { name: "Gerar a resposta de novo" }));
    expect(await screen.findByText("De novo.")).toBeInTheDocument();
    expect(api.enviar).toHaveBeenCalledWith("c1", "Quanto tenho?", expect.any(AbortSignal));
  });

  it("busca, renomeia e apaga com confirmação", async () => {
    const api = apiFalsa(roteiroSimples([]), { conversas: lista });
    renderizar(<Assistente api={api} />, fonte);
    const lateral = screen.getByRole("navigation", { name: "Conversas" });
    await within(lateral).findByRole("button", { name: "Carteira cripto" });

    await userEvent.type(within(lateral).getByRole("searchbox", { name: "Buscar conversas" }), "titulos");
    expect(within(lateral).queryByRole("button", { name: "Carteira cripto" })).toBeNull();
    expect(within(lateral).getByRole("button", { name: "Títulos de renda fixa" })).toBeInTheDocument();
    await userEvent.clear(within(lateral).getByRole("searchbox", { name: "Buscar conversas" }));

    await userEvent.click(within(lateral).getByRole("button", { name: "Renomear “Carteira cripto”" }));
    const campo = within(lateral).getByRole("textbox", { name: "Novo nome da conversa" });
    await userEvent.clear(campo);
    await userEvent.type(campo, "BTC e ETH{Enter}");
    await waitFor(() => expect(api.renomear).toHaveBeenCalledWith("c1", "BTC e ETH"));
    expect(await within(lateral).findByRole("button", { name: "BTC e ETH" })).toBeInTheDocument();
    // O foco volta para o botão de renomear (teclado e leitor de tela não se perdem).
    await waitFor(() => expect(document.activeElement?.getAttribute("aria-label")).toMatch(/^Renomear/));

    await userEvent.click(within(lateral).getByRole("button", { name: "Apagar “Taxas de saque”" }));
    const dialogo = await screen.findByRole("dialog", { name: /Apagar esta conversa/ });
    await userEvent.click(within(dialogo).getByRole("button", { name: "Apagar conversa" }));
    await waitFor(() => expect(api.apagar).toHaveBeenCalledWith("c3"));
  });

  it("atalhos: Ctrl+K busca e Ctrl+Shift+O começa uma conversa nova", async () => {
    const api = apiFalsa(roteiroSimples([]), { conversas: lista });
    api.gravar("c1", [msg("u0", "usuario", "Quanto tenho?")]);
    renderizar(<Assistente api={api} conversaInicial="c1" />, fonte);
    expect(await screen.findByRole("heading", { level: 1, name: "Carteira cripto" })).toBeInTheDocument();
    await userEvent.keyboard("{Control>}k{/Control}");
    expect(screen.getByRole("searchbox", { name: "Buscar conversas" })).toHaveFocus();
    await userEvent.keyboard("{Control>}{Shift>}o{/Shift}{/Control}");
    expect(await screen.findByRole("heading", { level: 1, name: "Assistente" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Sua pergunta" })).toHaveFocus();
  });

  it("a barra de conversas recolhe e volta", async () => {
    renderizar(<Assistente api={apiFalsa(roteiroSimples([]), { conversas: lista })} />, fonte);
    await userEvent.click(screen.getByRole("button", { name: "Esconder as conversas" }));
    await waitFor(() => expect(screen.queryByRole("navigation", { name: "Conversas" })).toBeNull());
    await userEvent.click(screen.getByRole("button", { name: "Mostrar as conversas" }));
    expect(await screen.findByRole("navigation", { name: "Conversas" })).toBeInTheDocument();
  });
});

describe("Assistente no modo de demonstração", () => {
  it("conversa com respostas de exemplo, sem API", async () => {
    renderizar(<Assistente />, { demo: true } as Fonte);
    expect(await screen.findByRole("navigation", { name: "Conversas" })).toBeInTheDocument();
    expect(screen.queryByText(/Indisponível no modo de demonstração/)).toBeNull();
  });
});

describe("Assistente → Configurações", () => {
  it("troca para o Claude Code com conta e modelo, e salva", async () => {
    const api = apiFalsa(roteiroSimples([]));
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
    const api = apiFalsa(roteiroSimples([]));
    renderizar(<Configuracoes api={api} />, fonte);
    await userEvent.selectOptions(await screen.findByLabelText("Modelo"), "__outro");
    await userEvent.type(screen.getByLabelText("Nome do modelo"), "-p");
    expect(screen.getByText(/sem começar com -/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(api.mudarConfig).not.toHaveBeenCalled();
  });
});
