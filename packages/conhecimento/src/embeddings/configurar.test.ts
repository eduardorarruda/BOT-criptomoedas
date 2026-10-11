import { describe, expect, it } from "vitest";
import { embeddingsDoAmbiente } from "./configurar.js";

describe("embeddingsDoAmbiente", () => {
  it("usa a Voyage por padrão e exige a chave", () => {
    expect(() => embeddingsDoAmbiente({})).toThrow(/VOYAGE_API_KEY/);
    expect(embeddingsDoAmbiente({ VOYAGE_API_KEY: "k" }).dimensoes).toBe(1024);
  });

  it("aceita o provedor local sem chave nenhuma", () => {
    expect(embeddingsDoAmbiente({ EMBEDDINGS_PROVEDOR: "ollama" }).dimensoes).toBe(1024);
  });

  it("recusa provedor desconhecido dizendo quais existem", () => {
    expect(() => embeddingsDoAmbiente({ EMBEDDINGS_PROVEDOR: "openai" })).toThrow(/voyage.*ollama/);
  });
});
