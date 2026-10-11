import type {
  EstadoAgenteAssistente,
  EventoChat,
  EventoRespostaAgente,
  PedidoRespostaAgente,
} from "@zentrade/contratos";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarClienteAssistente } from "../integracoes/assistente.js";
import { comSessao, montarApi, type Api, type Pessoa } from "./ajuda.js";

const SEGREDO = "a".repeat(40);
const ESTADO: EstadoAgenteAssistente = {
  provedores: { api: true, cli: true },
  provedorPadrao: "api",
  contasCli: [{ id: "pessoal", nome: "pessoal", logada: true }],
  modelos: { api: [{ id: "claude-opus-5", nome: "Opus 5", descricao: "x" }], cli: [] },
};

/** Um agente de mentira: responde o estado e transmite a resposta em NDJSON. */
interface AgenteFalso {
  readonly url: string;
  readonly pedidos: PedidoRespostaAgente[];
  roteiro: EventoRespostaAgente[];
  fechar(): Promise<void>;
}

async function subirAgenteFalso(): Promise<AgenteFalso> {
  const app: FastifyInstance = Fastify({ logger: false });
  const agente = { pedidos: [] as PedidoRespostaAgente[], roteiro: [] as EventoRespostaAgente[] };
  app.get("/assistente/estado", async (req, reply) =>
    req.headers.authorization === `Bearer ${SEGREDO}` ? ESTADO : reply.code(401).send({}),
  );
  app.post("/assistente/responder", async (req, reply) => {
    agente.pedidos.push(req.body as PedidoRespostaAgente);
    reply.hijack();
    reply.raw.writeHead(200, { "content-type": "application/x-ndjson" });
    for (const e of agente.roteiro) reply.raw.write(`${JSON.stringify(e)}\n`);
    reply.raw.write("linha que não é json\n");
    reply.raw.end();
  });
  const url = await app.listen({ host: "127.0.0.1", port: 0 });
  return Object.assign(agente, { url, fechar: () => app.close() });
}

/** Lê o corpo SSE (`data: <json>`) devolvido pelo inject. */
const eventosSse = (corpo: string): EventoChat[] =>
  corpo
    .split("\n\n")
    .filter((b) => b.startsWith("data: "))
    .map((b) => JSON.parse(b.slice(6)) as EventoChat);

describe("assistente pela API", () => {
  let api: Api;
  let agente: AgenteFalso;
  let ana: Pessoa;
  let beto: Pessoa;

  beforeAll(async () => {
    agente = await subirAgenteFalso();
    api = await montarApi({
      extras: () => ({ assistente: criarClienteAssistente({ url: agente.url, segredo: SEGREDO }) }),
    });
    ana = await api.pessoa("ana@exemplo.com");
    beto = await api.pessoa("beto@exemplo.com");
  });
  afterAll(async () => {
    await api.encerrar();
    await agente.fechar();
  });

  const pedir = (p: Pessoa, method: "GET" | "POST" | "PATCH" | "DELETE", url: string, payload?: unknown) =>
    api.app.inject({ method, url: `/api/v1${url}`, headers: comSessao(p), ...(payload ? { payload } : {}) });

  it("configuração: padrão do agente, troca validada contra o que o agente tem", async () => {
    const inicial = (await pedir(ana, "GET", "/assistente/config")).json();
    expect(inicial).toMatchObject({
      agenteNoAr: true,
      config: { provedor: "api", modelo: null, contaCli: null },
    });
    const trocada = await pedir(ana, "PATCH", "/assistente/config", {
      provedor: "cli",
      contaCli: "pessoal",
      modelo: "sonnet",
    });
    expect(trocada.statusCode).toBe(200);
    expect(trocada.json().config).toEqual({ provedor: "cli", modelo: "sonnet", contaCli: "pessoal" });
    expect((await pedir(beto, "GET", "/assistente/config")).json().config.provedor).toBe("api");
    const contaRuim = await pedir(ana, "PATCH", "/assistente/config", { contaCli: "trabalho" });
    expect(contaRuim.json().erro.codigo).toBe("conta_cli_inexistente");
    const modeloRuim = await pedir(ana, "PATCH", "/assistente/config", {
      modelo: "--dangerously-skip-permissions",
    });
    expect(modeloRuim.statusCode).toBe(400);
    const semCsrf = await api.app.inject({
      method: "PATCH",
      url: "/api/v1/assistente/config",
      headers: { cookie: ana.cookie },
      payload: { provedor: "api" },
    });
    expect(semCsrf.statusCode).toBe(403);
  });

  it("conversas são de cada pessoa", async () => {
    const criada = await pedir(ana, "POST", "/assistente/conversas", {});
    expect(criada.statusCode).toBe(201);
    const { id } = criada.json();
    expect((await pedir(beto, "GET", `/assistente/conversas/${id}`)).statusCode).toBe(404);
    expect((await pedir(beto, "DELETE", `/assistente/conversas/${id}`)).statusCode).toBe(404);
    expect(
      (await pedir(beto, "POST", `/assistente/conversas/${id}/mensagens`, { texto: "oi" })).statusCode,
    ).toBe(404);
    expect(
      (await pedir(ana, "PATCH", `/assistente/conversas/${id}`, { titulo: "Renomeada" })).json().titulo,
    ).toBe("Renomeada");
    expect(
      (await pedir(ana, "GET", "/assistente/conversas")).json().map((c: { id: string }) => c.id),
    ).toContain(id);
    expect((await pedir(beto, "GET", "/assistente/conversas")).json()).toEqual([]);
    expect((await pedir(ana, "DELETE", `/assistente/conversas/${id}`)).statusCode).toBe(204);
    expect((await pedir(ana, "GET", "/assistente/conversas/nao-uuid")).statusCode).toBe(404);
  });

  it("pergunta e resposta em SSE: grava as duas, dá título à conversa e manda o histórico ao agente", async () => {
    const { id } = (await pedir(ana, "POST", "/assistente/conversas", {})).json();
    agente.roteiro = [
      { tipo: "ferramenta", nome: "resumo_da_conta", descricao: "Lendo o resumo da sua conta" },
      { tipo: "texto", delta: "Hoje o resultado " },
      { tipo: "texto", delta: "foi zero." },
      { tipo: "fontes", fontes: [{ tipo: "nota", id: "n1", titulo: "Nota", url: "https://exemplo.com" }] },
      { tipo: "concluido", provedor: "cli", modelo: "sonnet" },
    ];
    const r = await pedir(ana, "POST", `/assistente/conversas/${id}/mensagens`, {
      texto: "Como foi o meu dia hoje?",
    });
    expect(r.headers["content-type"]).toMatch(/text\/event-stream/);
    const eventos = eventosSse(r.body);
    expect(eventos.map((e) => e.tipo)).toEqual(["inicio", "ferramenta", "texto", "texto", "fontes", "fim"]);
    const fim = eventos.at(-1) as Extract<EventoChat, { tipo: "fim" }>;
    expect(fim.mensagem).toMatchObject({
      papel: "assistente",
      texto: "Hoje o resultado foi zero.",
      situacao: "ok",
      provedor: "cli",
      modelo: "sonnet",
    });
    expect(fim.mensagem.ferramentas).toHaveLength(1);
    expect(agente.pedidos.at(-1)).toEqual({
      usuarioId: ana.id,
      historico: [],
      pergunta: "Como foi o meu dia hoje?",
    });
    const conversa = (await pedir(ana, "GET", `/assistente/conversas/${id}`)).json();
    expect(conversa.titulo).toBe("Como foi o meu dia hoje?");
    expect(conversa.mensagens.map((m: { papel: string }) => m.papel)).toEqual(["usuario", "assistente"]);

    agente.roteiro = [{ tipo: "erro", codigo: "cli_autenticacao", mensagem: "Faça o login de novo." }];
    const comErro = eventosSse(
      (await pedir(ana, "POST", `/assistente/conversas/${id}/mensagens`, { texto: "E ontem?" })).body,
    );
    expect(comErro.at(-1)).toMatchObject({
      tipo: "fim",
      mensagem: { situacao: "erro", erro: "Faça o login de novo." },
    });
    expect(agente.pedidos.at(-1)!.historico).toEqual([
      { papel: "usuario", texto: "Como foi o meu dia hoje?" },
      { papel: "assistente", texto: "Hoje o resultado foi zero." },
    ]);
  });

  it("resposta sem conclusão fica marcada como erro; token não conversa", async () => {
    const { id } = (await pedir(ana, "POST", "/assistente/conversas", { titulo: "Teste" })).json();
    agente.roteiro = [{ tipo: "texto", delta: "pela metade" }];
    const eventos = eventosSse(
      (await pedir(ana, "POST", `/assistente/conversas/${id}/mensagens`, { texto: "oi" })).body,
    );
    expect(eventos.at(-1)).toMatchObject({
      tipo: "fim",
      mensagem: { situacao: "erro", texto: "pela metade" },
    });
    expect((await pedir(ana, "GET", `/assistente/conversas/${id}`)).json().titulo).toBe("Teste");
    const vazio = await pedir(ana, "POST", `/assistente/conversas/${id}/mensagens`, { texto: "   " });
    expect(vazio.statusCode).toBe(400);
  });
});

describe("assistente sem agente", () => {
  let api: Api;
  let ana: Pessoa;
  beforeAll(async () => {
    api = await montarApi({
      extras: () => ({ assistente: criarClienteAssistente({ url: "http://127.0.0.1:9", segredo: SEGREDO }) }),
    });
    ana = await api.pessoa("ana@exemplo.com");
  });
  afterAll(async () => api.encerrar());

  it("configuração mostra o agente fora do ar e não deixa trocar; a resposta vira erro gravado", async () => {
    const cab = comSessao(ana);
    const estado = (
      await api.app.inject({ method: "GET", url: "/api/v1/assistente/config", headers: cab })
    ).json();
    expect(estado).toMatchObject({ agenteNoAr: false, provedores: { api: false, cli: false } });
    const troca = await api.app.inject({
      method: "PATCH",
      url: "/api/v1/assistente/config",
      headers: cab,
      payload: { provedor: "cli" },
    });
    expect(troca.statusCode).toBe(503);
    const { id } = (
      await api.app.inject({ method: "POST", url: "/api/v1/assistente/conversas", headers: cab, payload: {} })
    ).json();
    const r = await api.app.inject({
      method: "POST",
      url: `/api/v1/assistente/conversas/${id}/mensagens`,
      headers: cab,
      payload: { texto: "oi" },
    });
    expect(eventosSse(r.body).at(-1)).toMatchObject({
      tipo: "fim",
      mensagem: { situacao: "erro", erro: expect.stringMatching(/agente/) },
    });
  });
});

describe("assistente desligado (sem AGENTE_URL)", () => {
  let api: Api;
  beforeAll(async () => {
    api = await montarApi();
  });
  afterAll(async () => api.encerrar());

  it("responde 503 ao conversar", async () => {
    const ana = await api.pessoa("ana@exemplo.com");
    const cab = comSessao(ana);
    const { id } = (
      await api.app.inject({ method: "POST", url: "/api/v1/assistente/conversas", headers: cab, payload: {} })
    ).json();
    const r = await api.app.inject({
      method: "POST",
      url: `/api/v1/assistente/conversas/${id}/mensagens`,
      headers: cab,
      payload: { texto: "oi" },
    });
    expect(r.statusCode).toBe(503);
    expect(r.json().erro.codigo).toBe("assistente_indisponivel");
  });
});
