import { describe, expect, it, vi } from "vitest";
import { criarEmbeddings, fatiarTexto } from "./embeddings.js";

const vetor = (n: number) => Array.from({ length: 1024 }, () => n);

describe("embeddings (API compatível com OpenAI: Voyage, Ollama/bge-m3)", () => {
  it("pede os vetores e devolve na ordem dos textos", async () => {
    const buscar = vi.fn(
      async (_u: string | URL | Request, _i?: RequestInit) =>
        new Response(
          JSON.stringify({
            data: [
              { index: 1, embedding: vetor(2) },
              { index: 0, embedding: vetor(1) },
            ],
          }),
        ),
    );
    const e = criarEmbeddings({ url: "http://emb/v1/embeddings", modelo: "bge-m3", chave: "k" }, buscar);
    const vetores = await e.gerar(["a", "b"]);
    expect(vetores.map((v) => v[0])).toEqual([1, 2]);
    const init = buscar.mock.calls[0]![1]!;
    expect(JSON.parse(init.body as string)).toEqual({ model: "bge-m3", input: ["a", "b"] });
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer k");
  });

  it("recusa vetor com dimensão diferente de 1024", async () => {
    const buscar = vi.fn(
      async () => new Response(JSON.stringify({ data: [{ index: 0, embedding: [1, 2, 3] }] })),
    );
    const e = criarEmbeddings({ url: "http://emb", modelo: "m" }, buscar);
    await expect(e.gerar(["a"])).rejects.toThrow(/1024/);
  });

  it("explica quando o serviço de embeddings falha", async () => {
    const e = criarEmbeddings(
      { url: "http://emb", modelo: "m" },
      vi.fn(async () => new Response("x", { status: 503 })),
    );
    await expect(e.gerar(["a"])).rejects.toThrow(/embeddings respondeu 503/);
  });
});

describe("fatiar texto em trechos", () => {
  it("junta parágrafos curtos e respeita o tamanho máximo", () => {
    const texto = ["um", "dois", "três"].join("\n\n");
    expect(fatiarTexto(texto, 100)).toEqual(["um\n\ndois\n\ntrês"]);
    expect(fatiarTexto(texto, 9)).toEqual(["um\n\ndois", "três"]);
  });

  it("corta parágrafo gigante em pedaços", () => {
    const trechos = fatiarTexto("a".repeat(25), 10);
    expect(trechos).toEqual(["a".repeat(10), "a".repeat(10), "a".repeat(5)]);
  });

  it("texto vazio não gera trecho", () => {
    expect(fatiarTexto("  \n\n ", 10)).toEqual([]);
  });
});
