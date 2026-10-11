import { describe, expect, it, vi } from "vitest";
import { criarEmbeddingsOllama } from "./ollama.js";

const vetor = (x: number): number[] => Array.from({ length: 1024 }, () => x);

describe("embeddings locais (Ollama)", () => {
  it("chama /api/embed com o modelo bge-m3 por padrão", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ model: "bge-m3", embeddings: [vetor(1), vetor(2)] })));
    const emb = criarEmbeddingsOllama({ url: "http://ollama.test:11434/", fetch });
    const vetores = await emb.gerar(["a", "b"], "documento");
    expect(vetores.map((v) => v[0])).toEqual([1, 2]);
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe("http://ollama.test:11434/api/embed");
    expect(JSON.parse(init.body)).toEqual({ model: "bge-m3", input: ["a", "b"] });
  });

  it("divide em lotes", async () => {
    const fetch = vi
      .fn()
      .mockImplementation(
        async (_u: string, init: { body: string }) =>
          new Response(JSON.stringify({ embeddings: JSON.parse(init.body).input.map(() => vetor(0)) })),
      );
    const emb = criarEmbeddingsOllama({ tamanhoLote: 2, fetch });
    await expect(emb.gerar(["a", "b", "c"], "consulta")).resolves.toHaveLength(3);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("recusa quando o modelo não devolve 1024 dimensões ou devolve menos vetores", async () => {
    const errado = vi.fn().mockResolvedValue(new Response(JSON.stringify({ embeddings: [[1, 2, 3]] })));
    await expect(criarEmbeddingsOllama({ fetch: errado }).gerar(["a"], "documento")).rejects.toThrow(/1024/);
    const faltando = vi.fn().mockResolvedValue(new Response(JSON.stringify({ embeddings: [vetor(0)] })));
    await expect(criarEmbeddingsOllama({ fetch: faltando }).gerar(["a", "b"], "documento")).rejects.toThrow(
      /2 textos/,
    );
  });
});
