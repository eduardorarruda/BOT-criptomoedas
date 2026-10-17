import { describe, expect, it } from "vitest";
import { embeddingsDoAmbiente, PROVEDORES_EMBEDDINGS, provedorEmbeddings } from "./configurar.js";

describe("embeddingsDoAmbiente", () => {
  it("usa a Voyage por padrão e exige a chave", () => {
    expect(() => embeddingsDoAmbiente({})).toThrow(/VOYAGE_API_KEY/);
    expect(embeddingsDoAmbiente({ VOYAGE_API_KEY: "k" })?.dimensoes).toBe(1024);
  });

  it("sem a chave da Voyage, a mensagem sugere o modo só por palavras", () => {
    expect(() => embeddingsDoAmbiente({ EMBEDDINGS_PROVEDOR: "voyage" })).toThrow(
      /EMBEDDINGS_PROVEDOR=nenhum/,
    );
  });

  it("aceita o provedor local sem chave nenhuma", () => {
    expect(embeddingsDoAmbiente({ EMBEDDINGS_PROVEDOR: "ollama" })?.dimensoes).toBe(1024);
  });

  it("nenhum: sem embeddings (busca só por palavras), mesmo com chave da Voyage no ambiente", () => {
    expect(embeddingsDoAmbiente({ EMBEDDINGS_PROVEDOR: "nenhum" })).toBeNull();
    expect(embeddingsDoAmbiente({ EMBEDDINGS_PROVEDOR: "nenhum", VOYAGE_API_KEY: "k" })).toBeNull();
  });

  it("recusa provedor desconhecido dizendo quais existem", () => {
    expect(() => embeddingsDoAmbiente({ EMBEDDINGS_PROVEDOR: "openai" })).toThrow(/voyage, ollama ou nenhum/);
  });
});

describe("provedorEmbeddings", () => {
  it("lê o provedor com o mesmo padrão (voyage) e recusa os desconhecidos", () => {
    expect(provedorEmbeddings({})).toBe("voyage");
    expect(provedorEmbeddings({ EMBEDDINGS_PROVEDOR: "nenhum" })).toBe("nenhum");
    expect(PROVEDORES_EMBEDDINGS).toEqual(["voyage", "ollama", "nenhum"]);
    expect(() => provedorEmbeddings({ EMBEDDINGS_PROVEDOR: "openai" })).toThrow(/nenhum/);
  });
});
