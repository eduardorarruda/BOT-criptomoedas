import type { PropostaAgente } from "@zentrade/contratos";
import { dec } from "@zentrade/dominio";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ClienteAgente, ErroClienteAgente } from "./cliente-agente.js";
import { criarServidor } from "./servidor.js";
import { pedidoExemplo, USUARIO_TESTE } from "./teste/pedido.js";

const SEGREDO = "x".repeat(40);
const proposta: PropostaAgente = {
  acao: "comprar",
  confianca: 0.8,
  tamanhoRelativo: 1,
  stop: "58800",
  alvo: "61000",
  justificativa: "ok",
  riscos: [],
  fontes: [],
};
const analisar = vi.fn(async () => ({ proposta, custoUsd: dec("0.0456") }));
const app = criarServidor({ analista: { analisar }, segredo: SEGREDO, logger: false });
let url = "";

beforeAll(async () => {
  url = await app.listen({ host: "127.0.0.1", port: 0 });
});
afterAll(async () => app.close());

describe("ClienteAgente (PortaAgente por HTTP)", () => {
  it("fala com o serviço de verdade e devolve decimais exatos", async () => {
    const cliente = new ClienteAgente({ url, segredo: SEGREDO, usuarioId: USUARIO_TESTE });
    const r = await cliente.analisar(pedidoExemplo());
    expect(r.proposta).toEqual(proposta);
    expect(r.custoUsd.toFixed()).toBe("0.0456");
    const [pedido, opcoes] = analisar.mock.calls.at(-1) as unknown as [
      { preco: { toFixed(): string } },
      { usuarioId: string },
    ];
    expect(pedido.preco.toFixed()).toBe("60450");
    expect(opcoes.usuarioId).toBe(USUARIO_TESTE);
  });

  it("segredo errado vira erro claro", async () => {
    const cliente = new ClienteAgente({ url, segredo: "y".repeat(40) });
    await expect(cliente.analisar(pedidoExemplo())).rejects.toThrow(/401.*segredo|AGENTE_SEGREDO/s);
  });

  it("resposta fora do formato vira erro, não proposta", async () => {
    const fetch = vi.fn(
      async () => new Response(JSON.stringify({ proposta: { acao: "comprar" }, custoUsd: 1 })),
    );
    const cliente = new ClienteAgente({ url, segredo: SEGREDO, fetch });
    await expect(cliente.analisar(pedidoExemplo())).rejects.toBeInstanceOf(ErroClienteAgente);
  });

  it("serviço fora do ar ou lento vira erro (o motor não opera)", async () => {
    const lento = vi.fn(
      (_u: string, init: RequestInit) =>
        new Promise<Response>((_ok, falhar) =>
          init.signal?.addEventListener("abort", () => falhar(new Error("abortado"))),
        ),
    );
    const cliente = new ClienteAgente({ url, segredo: SEGREDO, fetch: lento, timeoutMs: 10 });
    await expect(cliente.analisar(pedidoExemplo())).rejects.toThrow(/não respondeu|tempo/);
  });

  it("recusa segredo curto na configuração", () => {
    expect(() => new ClienteAgente({ url, segredo: "curto" })).toThrow(/32/);
  });
});
