import type { EventoRespostaAgente } from "@zentrade/contratos";
import { describe, expect, it, vi } from "vitest";
import {
  configAssistenteDoAmbiente,
  criarClienteAssistente,
  ErroAgenteAssistente,
  montarResposta,
} from "./assistente.js";

const SEGREDO = "s".repeat(40);
const USUARIO = "7b0c8a52-1d2e-4c3b-9a8f-0e1d2c3b4a59";

const ndjson = (partes: string[]) =>
  new Response(
    new ReadableStream({
      start(c) {
        for (const p of partes) c.enqueue(new TextEncoder().encode(p));
        c.close();
      },
    }),
    { status: 200, headers: { "content-type": "application/x-ndjson" } },
  );

describe("configAssistenteDoAmbiente", () => {
  it("liga só com URL e segredo; segredo curto é erro", () => {
    expect(configAssistenteDoAmbiente({})).toBeNull();
    expect(configAssistenteDoAmbiente({ AGENTE_URL: "http://agente:8081" })).toBeNull();
    expect(
      configAssistenteDoAmbiente({ AGENTE_URL: "http://agente:8081/", AGENTE_SEGREDO: SEGREDO }),
    ).toEqual({
      url: "http://agente:8081",
      segredo: SEGREDO,
    });
    expect(() => configAssistenteDoAmbiente({ AGENTE_URL: "x", AGENTE_SEGREDO: "curto" })).toThrow(
      /AGENTE_SEGREDO|URL/,
    );
  });
});

describe("cliente do assistente no agente", () => {
  it("lê o NDJSON mesmo partido no meio da linha e ignora linha inválida", async () => {
    const buscar = vi.fn(async () =>
      ndjson([
        '{"tipo":"texto","de',
        'lta":"Olá"}\n',
        "lixo\n",
        '{"tipo":"desconhecido"}\n{"tipo":"concluido","provedor":"api","modelo":null}',
      ]),
    );
    const cliente = criarClienteAssistente({ url: "http://agente", segredo: SEGREDO, buscar });
    const eventos: EventoRespostaAgente[] = [];
    for await (const e of cliente.responder(
      { usuarioId: USUARIO, historico: [], pergunta: "oi" },
      new AbortController().signal,
    )) {
      eventos.push(e);
    }
    expect(eventos).toEqual([
      { tipo: "texto", delta: "Olá" },
      { tipo: "concluido", provedor: "api", modelo: null },
    ]);
    const [url, init] = buscar.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://agente/assistente/responder");
    expect((init.headers as Record<string, string>)["authorization"]).toBe(`Bearer ${SEGREDO}`);
  });

  it("agente com erro HTTP vira exceção com a mensagem dele", async () => {
    const corpo = { erro: { codigo: "limite_excedido", mensagem: "Muitas respostas" } };
    const cliente = criarClienteAssistente({
      url: "http://agente",
      segredo: SEGREDO,
      buscar: async () => new Response(JSON.stringify(corpo), { status: 429 }),
    });
    const iterar = async () => {
      for await (const _ of cliente.responder(
        { usuarioId: USUARIO, historico: [], pergunta: "oi" },
        new AbortController().signal,
      )) {
        // nada
      }
    };
    await expect(iterar()).rejects.toThrow(ErroAgenteAssistente);
    await expect(iterar()).rejects.toThrow(/Muitas respostas/);
    const semCorpo = criarClienteAssistente({
      url: "http://a",
      segredo: SEGREDO,
      buscar: async () => new Response("x", { status: 500 }),
    });
    const iterar2 = async () => {
      for await (const _ of semCorpo.responder(
        { usuarioId: USUARIO, historico: [], pergunta: "oi" },
        new AbortController().signal,
      )) {
        // nada
      }
    };
    await expect(iterar2()).rejects.toThrow(/500/);
  });

  it("estado: null quando o agente cai, recusa ou responde fora do formato", async () => {
    const estado = {
      provedores: { api: true, cli: false },
      provedorPadrao: "api",
      contasCli: [],
      modelos: { api: [], cli: [] },
    };
    const ok = criarClienteAssistente({
      url: "http://a",
      segredo: SEGREDO,
      buscar: async () => Response.json(estado),
    });
    expect(await ok.estado()).toEqual(estado);
    const fora = criarClienteAssistente({
      url: "http://a",
      segredo: SEGREDO,
      buscar: async () => Response.json({ x: 1 }),
    });
    expect(await fora.estado()).toBeNull();
    const recusa = criarClienteAssistente({
      url: "http://a",
      segredo: SEGREDO,
      buscar: async () => new Response("", { status: 401 }),
    });
    expect(await recusa.estado()).toBeNull();
    const caiu = criarClienteAssistente({
      url: "http://a",
      segredo: SEGREDO,
      buscar: async () => {
        throw new Error("ECONNREFUSED");
      },
    });
    expect(await caiu.estado()).toBeNull();
  });
});

describe("montarResposta", () => {
  it("junta texto, ferramentas e fontes; concluído = ok", () => {
    const r = montarResposta();
    r.aplicar({ tipo: "texto", delta: "a" });
    r.aplicar({ tipo: "texto", delta: "b" });
    r.aplicar({ tipo: "ferramenta", nome: "x", descricao: "y" });
    r.aplicar({ tipo: "fontes", fontes: [{ tipo: "nota", id: "n", titulo: "t" }] });
    r.aplicar({ tipo: "concluido", provedor: "api", modelo: "m" });
    r.falhar("erro", "ignorado depois de concluir");
    expect(r.resultado()).toMatchObject({
      texto: "ab",
      situacao: "ok",
      erro: null,
      provedor: "api",
      modelo: "m",
    });
    expect(r.resultado().ferramentas).toHaveLength(1);
  });

  it("erro do agente, interrupção ou fim sem conclusão viram erro", () => {
    const comErro = montarResposta();
    comErro.aplicar({ tipo: "erro", codigo: "x", mensagem: "caiu" });
    expect(comErro.resultado()).toMatchObject({ situacao: "erro", erro: "caiu" });
    const interrompida = montarResposta();
    interrompida.falhar("interrompida", "parou");
    expect(interrompida.resultado().situacao).toBe("interrompida");
    expect(montarResposta().resultado()).toMatchObject({
      situacao: "erro",
      erro: expect.stringMatching(/sem conclusão/),
    });
  });
});
