import { EventoRespostaAgenteEsquema, type EstadoAgenteAssistente } from "@zentrade/contratos";
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { USUARIO_TESTE } from "../teste/pedido.js";
import { registrarRotasAssistente, type ServicoResposta } from "./rotas.js";

const SEGREDO = "s".repeat(40);
const auth = { authorization: `Bearer ${SEGREDO}` };
const estado: EstadoAgenteAssistente = {
  provedores: { api: true, cli: false },
  provedorPadrao: "api",
  contasCli: [],
  modelos: { api: [], cli: [] },
};
const pedido = { usuarioId: USUARIO_TESTE, historico: [], pergunta: "oi" };

let app: FastifyInstance | undefined;
afterEach(async () => app?.close());

function montar(servico: ServicoResposta, extra: { tempoMs?: number; maxSimultaneas?: number } = {}) {
  app = Fastify({ logger: false });
  registrarRotasAssistente(app, { segredo: SEGREDO, servico, estado: () => estado, ...extra });
  return app;
}

describe("rotas do assistente no agente", () => {
  it("estado e resposta exigem o segredo", async () => {
    const a = montar({ responder: vi.fn() });
    expect((await a.inject({ method: "GET", url: "/assistente/estado" })).statusCode).toBe(401);
    expect(
      (await a.inject({ method: "POST", url: "/assistente/responder", payload: pedido })).statusCode,
    ).toBe(401);
    expect((await a.inject({ method: "GET", url: "/assistente/estado", headers: auth })).json()).toEqual(
      estado,
    );
  });

  it("responde em NDJSON, um evento por linha, na ordem", async () => {
    const a = montar({
      responder: async (_p, emitir) => {
        emitir({ tipo: "texto", delta: "Olá" });
        emitir({ tipo: "concluido", provedor: "api", modelo: null });
      },
    });
    const r = await a.inject({
      method: "POST",
      url: "/assistente/responder",
      headers: auth,
      payload: pedido,
    });
    expect(r.statusCode).toBe(200);
    expect(r.headers["content-type"]).toMatch(/application\/x-ndjson/);
    const eventos = r.body
      .trim()
      .split("\n")
      .map((l) => EventoRespostaAgenteEsquema.parse(JSON.parse(l)));
    expect(eventos.map((e) => e.tipo)).toEqual(["texto", "concluido"]);
  });

  it("pedido inválido: 400; limite de respostas simultâneas: 429", async () => {
    let liberar: () => void = () => undefined;
    const a = montar({ responder: () => new Promise<void>((ok) => (liberar = ok)) }, { maxSimultaneas: 1 });
    const invalido = await a.inject({
      method: "POST",
      url: "/assistente/responder",
      headers: auth,
      payload: { pergunta: "" },
    });
    expect(invalido.statusCode).toBe(400);
    const primeira = a.inject({
      method: "POST",
      url: "/assistente/responder",
      headers: auth,
      payload: pedido,
    });
    await new Promise((r) => setTimeout(r, 20));
    const segunda = await a.inject({
      method: "POST",
      url: "/assistente/responder",
      headers: auth,
      payload: pedido,
    });
    expect(segunda.statusCode).toBe(429);
    liberar();
    expect((await primeira).statusCode).toBe(200);
  });

  it("prazo da resposta cancela o serviço", async () => {
    const vistos: boolean[] = [];
    const a = montar(
      {
        responder: (_p, _e, sinal) =>
          new Promise<void>((ok) => sinal.addEventListener("abort", () => (vistos.push(true), ok()))),
      },
      { tempoMs: 30 },
    );
    const r = await a.inject({
      method: "POST",
      url: "/assistente/responder",
      headers: auth,
      payload: pedido,
    });
    expect(r.statusCode).toBe(200);
    expect(vistos).toEqual([true]);
  });
});
