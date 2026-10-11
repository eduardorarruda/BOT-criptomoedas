import type { EventoChat } from "@zentrade/contratos/esquemas";
import { describe, expect, it, vi } from "vitest";
import { criarApiAssistente, lerEventos } from "./api";

const corpo = (partes: string[]) =>
  new ReadableStream<Uint8Array>({
    start(c) {
      for (const p of partes) c.enqueue(new TextEncoder().encode(p));
      c.close();
    },
  });

async function todos(gen: AsyncIterable<EventoChat>): Promise<EventoChat[]> {
  const lista: EventoChat[] = [];
  for await (const e of gen) lista.push(e);
  return lista;
}

describe("lerEventos (SSE)", () => {
  it("junta blocos partidos, ignora comentário e evento fora do contrato", async () => {
    const eventos = await todos(
      lerEventos(
        corpo([
          'data: {"tipo":"tex',
          'to","delta":"Olá"}\n\n: comentário\n\ndata: {"tipo":"desconhecido"}\n\n',
          'data: {"tipo":"texto","delta":" mundo"}\n\ndata: quebrado\n\n',
          'data: {"tipo":"texto","delta":"!"}',
        ]),
      ),
    );
    expect(eventos).toEqual([
      { tipo: "texto", delta: "Olá" },
      { tipo: "texto", delta: " mundo" },
      { tipo: "texto", delta: "!" },
    ]);
  });
});

describe("api do assistente", () => {
  const cliente = { pedir: vi.fn() };

  it("envia a pergunta com o CSRF e lê o fluxo", async () => {
    const buscar = vi.fn(
      async () => new Response(corpo(['data: {"tipo":"texto","delta":"oi"}\n\n']), { status: 200 }),
    );
    const api = criarApiAssistente(cliente as never, buscar as never, () => "csrf-1");
    const eventos = await todos(api.enviar("c 1", "pergunta", new AbortController().signal));
    expect(eventos).toEqual([{ tipo: "texto", delta: "oi" }]);
    const [url, init] = buscar.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/v1/assistente/conversas/c%201/mensagens");
    expect((init.headers as Record<string, string>)["X-CSRF-Token"]).toBe("csrf-1");
    expect(JSON.parse(String(init.body))).toEqual({ texto: "pergunta" });
  });

  it("erro da API vira ErroApi com a mensagem dela; sem conexão vira mensagem clara; cancelado encerra", async () => {
    const erro = { erro: { codigo: "assistente_indisponivel", mensagem: "o assistente está desligado" } };
    const api = criarApiAssistente(
      cliente as never,
      (async () => new Response(JSON.stringify(erro), { status: 503 })) as never,
      () => null,
    );
    await expect(todos(api.enviar("c", "p", new AbortController().signal))).rejects.toMatchObject({
      codigo: "assistente_indisponivel",
    });
    const semRede = criarApiAssistente(
      cliente as never,
      (async () => Promise.reject(new TypeError("rede"))) as never,
    );
    await expect(todos(semRede.enviar("c", "p", new AbortController().signal))).rejects.toMatchObject({
      codigo: "sem_conexao",
    });
    const parado = new AbortController();
    parado.abort();
    expect(await todos(semRede.enviar("c", "p", parado.signal))).toEqual([]);
  });

  it("as rotas REST usam os caminhos do contrato", async () => {
    const pedir = vi.fn(async () => undefined);
    const api = criarApiAssistente({ pedir } as never, vi.fn() as never);
    await api.estado();
    await api.mudarConfig({ provedor: "cli" });
    await api.conversas();
    await api.conversa("x");
    await api.criarConversa();
    await api.renomear("x", "t");
    await api.apagar("x");
    expect(pedir.mock.calls.map((c: unknown[]) => `${c[0]} ${c[1]}`)).toEqual([
      "GET /assistente/config",
      "PATCH /assistente/config",
      "GET /assistente/conversas",
      "GET /assistente/conversas/x",
      "POST /assistente/conversas",
      "PATCH /assistente/conversas/x",
      "DELETE /assistente/conversas/x",
    ]);
  });
});
