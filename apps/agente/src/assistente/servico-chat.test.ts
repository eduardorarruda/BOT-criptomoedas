import type { DecisaoDTO, EventoRespostaAgente } from "@zentrade/contratos";
import { describe, expect, it, vi } from "vitest";
import { ErroClaudeCli } from "../claude-cli/analista-cli.js";
import {
  anthropicFalso,
  emStreaming,
  mensagemFalsa,
  texto,
  usoFerramenta,
} from "../teste/anthropic-falso.js";
import { investimentosFalsos } from "../teste/investimentos-falsos.js";
import { USUARIO_TESTE } from "../teste/pedido.js";
import { ChatApi } from "./chat-api.js";
import type { ChatCli } from "./chat-cli.js";
import type { DadosDaPessoa } from "./ferramentas-chat.js";
import { SYSTEM_CHAT } from "./prompt-chat.js";
import { ServicoChat } from "./servico-chat.js";

const DECISAO = "3f1c8a52-1d2e-4c3b-9a8f-0e1d2c3b4a59";

const decisao: DecisaoDTO = {
  id: DECISAO,
  roboId: "robo-1",
  em: Date.UTC(2026, 9, 9, 14, 0),
  sinal: { acao: "COMPRAR", explicacao: "preço abaixo da média" },
  proposta: {
    acao: "comprar",
    confianca: 0.7,
    tamanhoRelativo: 1,
    justificativa: "bom momento",
    riscos: [],
    fontes: [],
  },
  preco: "60000",
  risco: { aprovada: true, barreiras: [] },
  estado: "executada",
  desfecho: { resultado: "3.2", avaliadoEm: 1 },
};

function dados(): DadosDaPessoa {
  return {
    resumo: vi.fn(async () => ({
      resultadoHoje: "1.5",
      exposicao: "0",
      maiorQueda30d: "0",
      robosAtivos: 1,
      custoIaHoje: "0",
      taxasHoje: "0.1",
      paradaTotal: false,
    })),
    robos: vi.fn(async () => []),
    decisoes: vi.fn(async () => [decisao]),
    decisao: vi.fn(async () => decisao),
    ordens: vi.fn(async () => []),
    ...investimentosFalsos(),
  };
}

const busca = {
  buscar: vi.fn(async () => [
    {
      trechoId: "t1",
      documentoId: "doc-1",
      fonte: "nota" as const,
      titulo: "Meu plano",
      url: "https://exemplo.com/plano",
      publicadoEm: new Date("2026-09-01T00:00:00Z"),
      texto: "Nunca arriscar mais de 1%.",
      pontuacao: 0.1,
    },
  ]),
};

const pedido = {
  usuarioId: USUARIO_TESTE,
  historico: [
    { papel: "usuario" as const, texto: "oi" },
    { papel: "assistente" as const, texto: "olá!" },
  ],
  pergunta: "Como foi ontem?",
};

async function responder(servico: ServicoChat, sinal = new AbortController().signal) {
  const eventos: EventoRespostaAgente[] = [];
  await servico.responder(pedido, (e) => eventos.push(e), sinal);
  return eventos;
}

describe("ServicoChat com a API (Tool Runner em streaming, cliente falso)", () => {
  it("transmite o texto, as ferramentas usadas, as fontes consultadas e conclui", async () => {
    const falso = anthropicFalso([
      emStreaming(
        mensagemFalsa({
          content: [
            texto("Vou olhar."),
            usoFerramenta("decisoes_recentes", { limite: 5 }),
            usoFerramenta("buscar_conhecimento", { consulta: "plano" }, "toolu_2"),
          ],
          stop_reason: "tool_use",
        }),
      ),
      emStreaming(
        mensagemFalsa({
          content: [texto("Ontem o robô comprou e lucrou 3,2 USDT.")],
          stop_reason: "end_turn",
        }),
      ),
    ]);
    const d = dados();
    const servico = new ServicoChat({
      dados: d,
      busca,
      config: async () => ({ provedor: "api", modelo: "claude-sonnet-5", contaCli: null }),
      api: new ChatApi({ cliente: falso.cliente, agora: () => new Date("2026-10-10T12:00:00Z") }),
      cli: null,
    });
    const eventos = await responder(servico);
    const textoTodo = eventos.flatMap((e) => (e.tipo === "texto" ? [e.delta] : [])).join("");
    expect(textoTodo).toBe("Vou olhar.\n\nOntem o robô comprou e lucrou 3,2 USDT.");
    expect(eventos.filter((e) => e.tipo === "ferramenta").map((e) => (e as { nome: string }).nome)).toEqual([
      "decisoes_recentes",
      "buscar_conhecimento",
    ]);
    const fontes = eventos.find((e) => e.tipo === "fontes") as {
      fontes: { id: string; url?: string | null }[];
    };
    expect(fontes.fontes.map((f) => f.id)).toEqual([DECISAO, "doc-1"]);
    expect(fontes.fontes[1]!.url).toBe("https://exemplo.com/plano");
    expect(eventos.at(-1)).toEqual({ tipo: "concluido", provedor: "api", modelo: "claude-sonnet-5" });
    expect(d.decisoes).toHaveBeenCalledWith(USUARIO_TESTE, { limite: 5 });
    expect(busca.buscar).toHaveBeenCalledWith("plano", expect.objectContaining({ usuarioId: USUARIO_TESTE }));

    const corpo = falso.pedidos[0]!.corpo;
    expect(corpo.model).toBe("claude-sonnet-5");
    expect(corpo["stream"]).toBe(true);
    expect((corpo.system as { text: string }[])[0]!.text).toBe(SYSTEM_CHAT);
    expect(corpo.messages.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    const nomes = (corpo.tools as { name: string }[]).map((t) => t.name);
    expect(nomes).toEqual([
      "resumo_da_conta",
      "listar_robos",
      "decisoes_recentes",
      "explicar_decisao",
      "ordens_recentes",
      "buscar_conhecimento",
      "carteira_cripto",
      "renda_fixa",
      "investimentos_imobiliarios",
    ]);
    for (const n of nomes) expect(n).not.toMatch(/enviar|ordem_nova|aprovar|parada/);
  });

  it("falha ao ler os investimentos: o modelo recebe a frase curta, o log recebe o erro", async () => {
    const falso = anthropicFalso([
      emStreaming(mensagemFalsa({ content: [usoFerramenta("renda_fixa", {})], stop_reason: "tool_use" })),
      emStreaming(
        mensagemFalsa({ content: [texto("Não consegui ler a renda fixa agora.")], stop_reason: "end_turn" }),
      ),
    ]);
    const quebrado = new Error("connect ECONNREFUSED 10.0.0.5:5432");
    const aoFalhar = vi.fn();
    const servico = new ServicoChat({
      dados: {
        ...dados(),
        titulosRendaFixa: vi.fn(async () => {
          throw quebrado;
        }),
      },
      busca,
      config: async () => ({ provedor: "api", modelo: null, contaCli: null }),
      api: new ChatApi({ cliente: falso.cliente }),
      cli: null,
      aoFalhar,
    });
    const eventos = await responder(servico);
    expect(eventos.at(-1)).toMatchObject({ tipo: "concluido" });
    expect(eventos).toContainEqual({
      tipo: "ferramenta",
      nome: "renda_fixa",
      descricao: "Lendo os seus títulos de renda fixa",
    });
    const resultado = JSON.stringify(falso.pedidos[1]!.corpo.messages.at(-1));
    expect(resultado).toContain("A ferramenta renda_fixa falhou agora");
    expect(resultado).toContain('"is_error":true');
    expect(resultado).not.toMatch(/ECONNREFUSED|10\.0\.0\.5/);
    expect(aoFalhar).toHaveBeenCalledWith(quebrado, "renda_fixa");
  });

  it("parada por limite de tokens vira aviso no fim do texto", async () => {
    const falso = anthropicFalso([
      emStreaming(mensagemFalsa({ content: [texto("Começo")], stop_reason: "max_tokens" })),
    ]);
    const servico = new ServicoChat({
      dados: dados(),
      busca,
      config: async () => ({ provedor: "api", modelo: null, contaCli: null }),
      api: new ChatApi({ cliente: falso.cliente }),
      cli: null,
    });
    const eventos = await responder(servico);
    const textoTodo = eventos.flatMap((e) => (e.tipo === "texto" ? [e.delta] : [])).join("");
    expect(textoTodo).toMatch(/Começo\n\n_A resposta passou do tamanho máximo/);
    expect(eventos.at(-1)).toMatchObject({ tipo: "concluido", modelo: null });
  });

  it("erro da API vira evento de erro em português, sem detalhe interno", async () => {
    const falso = anthropicFalso([
      {
        status: 401,
        corpo: { type: "error", error: { type: "authentication_error", message: "x-api-key sk-ant-123" } },
      },
    ]);
    const aoFalhar = vi.fn();
    const servico = new ServicoChat({
      dados: dados(),
      busca,
      config: async () => ({ provedor: "api", modelo: null, contaCli: null }),
      api: new ChatApi({ cliente: falso.cliente }),
      cli: null,
      aoFalhar,
    });
    const [erro] = await responder(servico);
    expect(erro).toMatchObject({ tipo: "erro", codigo: "api_chave" });
    expect(JSON.stringify(erro)).not.toMatch(/sk-ant/);
    expect(aoFalhar).toHaveBeenCalledOnce();
  });
});

describe("ServicoChat: escolha do provedor", () => {
  it("usa o Claude Code com a conta escolhida", async () => {
    const responderCli = vi.fn(async (p: { aoTexto: (d: string) => void; contaId: string | null }) =>
      p.aoTexto("pelo CLI"),
    );
    const servico = new ServicoChat({
      dados: dados(),
      busca,
      config: async () => ({ provedor: "cli", modelo: "opus", contaCli: "pessoal" }),
      api: null,
      cli: { responder: responderCli } as unknown as ChatCli,
    });
    const eventos = await responder(servico);
    expect(eventos[0]).toEqual({ tipo: "texto", delta: "pelo CLI" });
    expect(responderCli.mock.calls[0]![0]).toMatchObject({
      contaId: "pessoal",
      modelo: "opus",
      pergunta: "Como foi ontem?",
    });
    // As mesmas ferramentas vão para a ponte MCP, inclusive as de investimentos.
    const { ferramentas } = responderCli.mock.calls[0]![0] as unknown as { ferramentas: { nome: string }[] };
    expect(ferramentas.map((f) => f.nome)).toEqual(
      expect.arrayContaining(["carteira_cripto", "renda_fixa", "investimentos_imobiliarios"]),
    );
    expect(eventos.at(-1)).toEqual({ tipo: "concluido", provedor: "cli", modelo: "opus" });
  });

  it("provedor escolhido indisponível, falha do CLI e cancelamento viram erro claro", async () => {
    const base = { dados: dados(), busca, api: null };
    const semCli = new ServicoChat({
      ...base,
      cli: null,
      config: async () => ({ provedor: "cli", modelo: null, contaCli: null }),
    });
    expect((await responder(semCli))[0]).toMatchObject({
      tipo: "erro",
      mensagem: expect.stringMatching(/não está instalado/),
    });
    const semApi = new ServicoChat({
      ...base,
      cli: null,
      config: async () => ({ provedor: "api", modelo: null, contaCli: null }),
    });
    expect((await responder(semApi))[0]).toMatchObject({
      tipo: "erro",
      mensagem: expect.stringMatching(/ANTHROPIC_API_KEY/),
    });
    const cliFalha = {
      responder: async () => {
        throw new ErroClaudeCli("autenticacao", "Faça o login de novo.");
      },
    } as unknown as ChatCli;
    const comFalha = new ServicoChat({
      ...base,
      cli: cliFalha,
      config: async () => ({ provedor: "cli", modelo: null, contaCli: null }),
    });
    expect((await responder(comFalha))[0]).toEqual({
      tipo: "erro",
      codigo: "cli_autenticacao",
      mensagem: "Faça o login de novo.",
    });
    const aoFalhar = vi.fn();
    const comDetalhe = new ServicoChat({
      ...base,
      cli: {
        responder: async () => {
          throw new ErroClaudeCli("falhou", "O Claude Code terminou com erro.", "/home/x/.claude: boom");
        },
      } as unknown as ChatCli,
      config: async () => ({ provedor: "cli", modelo: null, contaCli: null }),
      aoFalhar,
    });
    const [erroGenerico] = await responder(comDetalhe);
    expect(JSON.stringify(erroGenerico)).not.toMatch(/boom/);
    expect(aoFalhar).toHaveBeenCalledOnce();
    const controle = new AbortController();
    controle.abort();
    const cancelado = new ServicoChat({
      ...base,
      cli: {
        responder: async () => {
          throw new Error("abort");
        },
      } as unknown as ChatCli,
      config: async () => ({ provedor: "cli", modelo: null, contaCli: null }),
    });
    expect((await responder(cancelado, controle.signal))[0]).toMatchObject({ codigo: "cancelado" });
  });
});
