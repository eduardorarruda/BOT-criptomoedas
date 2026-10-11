import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { comSessao, montarApi, type Api, type Pessoa } from "./ajuda.js";

describe("quando algo de fora falha", () => {
  let api: Api;
  let ana: Pessoa;

  beforeAll(async () => {
    api = await montarApi({ fila: { adicionar: () => Promise.reject(new Error("Redis fora")) } });
    ana = await api.pessoa("ana@exemplo.com");
  });
  afterAll(async () => api.encerrar());

  it("fila fora do ar: 503 e o backtest fica marcado como falhou", async () => {
    const e = await api.banco.estrategias.criar(ana.id, {
      nome: "x",
      entrada: {
        tipo: "comparar",
        esquerda: { tipo: "preco" },
        comparador: ">",
        direita: { tipo: "numero", valor: 1 },
      },
      stop: 0.02,
      alvoLiquido: 0.01,
      taxa: 0.001,
    });
    const r = await api.app.inject({
      method: "POST",
      url: "/api/v1/backtests",
      headers: comSessao(ana),
      payload: { estrategiaId: e.id, versao: 1, simbolo: "BTCUSDT", intervalo: "1h", inicio: 0, fim: 1000 },
    });
    expect(r.statusCode).toBe(503);
    expect(r.json()).toMatchObject({ erro: { codigo: "fila_indisponivel" } });
    const [b] = await api.banco.conexao.sql`select estado from backtests`;
    expect(b!.estado).toBe("falhou");
  });

  it("sem serviço de embeddings, notas e conhecimento do n8n explicam como configurar", async () => {
    const r = await api.app.inject({
      method: "POST",
      url: "/api/v1/conhecimento/notas",
      headers: comSessao(ana),
      payload: { titulo: "x", texto: "y" },
    });
    expect(r.statusCode).toBe(503);
    expect(r.json<{ erro: { mensagem: string } }>().erro.mensagem).toMatch(/EMBEDDINGS_URL/);
  });
});
