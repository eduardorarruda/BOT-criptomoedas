import { describe, expect, it, vi } from "vitest";
import { criarEmbeddingsVoyage } from "./voyage.js";

const vetor = (x: number): number[] => Array.from({ length: 1024 }, () => x);

function respostaVoyage(n: number, inicio = 0): Response {
  const data = Array.from({ length: n }, (_, i) => ({
    object: "embedding",
    embedding: vetor(inicio + i),
    index: i,
  }));
  return new Response(
    JSON.stringify({ object: "list", data: data.reverse(), model: "voyage-4", usage: { total_tokens: 3 } }),
    {
      status: 200,
    },
  );
}

describe("embeddings Voyage", () => {
  it("falha com instrução clara quando a chave não foi configurada", () => {
    expect(() => criarEmbeddingsVoyage({ chave: "" })).toThrow(/VOYAGE_API_KEY/);
  });

  it("pede 1024 dimensões, com o tipo de entrada certo, e devolve na ordem dos textos", async () => {
    const fetch = vi.fn().mockResolvedValue(respostaVoyage(2));
    const emb = criarEmbeddingsVoyage({ chave: "k", modelo: "voyage-4", fetch });
    const vetores = await emb.gerar(["a", "b"], "consulta");
    expect(emb.dimensoes).toBe(1024);
    expect(vetores.map((v) => v[0])).toEqual([0, 1]);
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe("https://api.voyageai.com/v1/embeddings");
    expect(init.headers.authorization).toBe("Bearer k");
    expect(JSON.parse(init.body)).toEqual({
      input: ["a", "b"],
      model: "voyage-4",
      input_type: "query",
      output_dimension: 1024,
    });
  });

  it("divide em lotes e junta os resultados", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(respostaVoyage(2, 0))
      .mockResolvedValueOnce(respostaVoyage(1, 2));
    const emb = criarEmbeddingsVoyage({ chave: "k", tamanhoLote: 2, fetch });
    const vetores = await emb.gerar(["a", "b", "c"], "documento");
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetch.mock.calls[0]![1].body).input_type).toBe("document");
    expect(vetores.map((v) => v[0])).toEqual([0, 1, 2]);
  });

  it("não chama o serviço para lista vazia", async () => {
    const fetch = vi.fn();
    await expect(criarEmbeddingsVoyage({ chave: "k", fetch }).gerar([], "documento")).resolves.toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("recusa resposta com dimensão errada ou formato inesperado", async () => {
    const curta = new Response(JSON.stringify({ data: [{ embedding: [1, 2], index: 0 }] }), { status: 200 });
    const emb = criarEmbeddingsVoyage({ chave: "k", fetch: vi.fn().mockResolvedValue(curta) });
    await expect(emb.gerar(["a"], "documento")).rejects.toThrow(/1024/);
    const torta = new Response(JSON.stringify({ nada: true }), { status: 200 });
    const emb2 = criarEmbeddingsVoyage({ chave: "k", fetch: vi.fn().mockResolvedValue(torta) });
    await expect(emb2.gerar(["a"], "documento")).rejects.toThrow(/Voyage/);
  });
});
