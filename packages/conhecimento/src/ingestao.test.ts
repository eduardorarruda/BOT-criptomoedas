import { describe, expect, it, vi } from "vitest";
import { criarEmbeddingsDeterministicos } from "./embeddings/deterministicos.js";
import { ErroConhecimento, ingerir, textoParaEmbedding } from "./ingestao.js";
import type { RepositorioConhecimento, TrechoParaGravar } from "./tipos.js";

const USUARIO = "7b0c8a52-1d2e-4c3b-9a8f-0e1d2c3b4a59";

function repoFalso(existente: string | null = null) {
  const gravados: { trechos: readonly TrechoParaGravar[] }[] = [];
  const repo: RepositorioConhecimento = {
    documentoPorHash: vi.fn(async () => existente),
    gravarDocumento: vi.fn(async (doc, trechos) => {
      gravados.push({ trechos });
      return { documentoId: doc.id, novo: true };
    }),
    buscarVetorial: vi.fn(async () => []),
    buscarTextual: vi.fn(async () => []),
  };
  return { repo, gravados };
}

const doc = {
  usuarioId: USUARIO,
  fonte: "regra_corretora" as const,
  titulo: "Taxas da Binance",
  url: "https://www.binance.com/pt-BR/fee",
  publicadoEm: new Date("2026-09-01T00:00:00Z"),
  texto: "# Taxas\nA taxa padrão é 0,1% por ordem.\n\n# Saques\nO saque mínimo de USDT é 10.",
};

describe("ingerir", () => {
  it("normaliza, divide, gera embeddings de documento e grava os trechos em ordem", async () => {
    const { repo, gravados } = repoFalso();
    const embeddings = criarEmbeddingsDeterministicos();
    const gerar = vi.spyOn(embeddings, "gerar");
    const r = await ingerir(doc, { repositorio: repo, embeddings });
    expect(r).toMatchObject({ novo: true, trechos: 2 });
    expect(gerar).toHaveBeenCalledWith(expect.any(Array), "documento");
    const trechos = gravados[0]!.trechos;
    expect(trechos.map((t) => t.ordem)).toEqual([0, 1]);
    expect(trechos[0]!.texto).toMatch(/^# Taxas/);
    expect(trechos[0]!.embedding).toHaveLength(1024);
    const [documento] = vi.mocked(repo.gravarDocumento).mock.calls[0]!;
    expect(documento).toMatchObject({
      usuarioId: USUARIO,
      fonte: "regra_corretora",
      titulo: "Taxas da Binance",
    });
    expect(documento.hashConteudo).toMatch(/^[0-9a-f]{64}$/);
  });

  it("não duplica: conteúdo já ingerido devolve o documento existente sem gastar embeddings", async () => {
    const { repo } = repoFalso("doc-antigo");
    const embeddings = criarEmbeddingsDeterministicos();
    const gerar = vi.spyOn(embeddings, "gerar");
    await expect(ingerir(doc, { repositorio: repo, embeddings })).resolves.toEqual({
      documentoId: "doc-antigo",
      novo: false,
      trechos: 0,
    });
    expect(gerar).not.toHaveBeenCalled();
    expect(repo.gravarDocumento).not.toHaveBeenCalled();
  });

  it("valida a entrada na borda com mensagem clara", async () => {
    const { repo } = repoFalso();
    const deps = { repositorio: repo, embeddings: criarEmbeddingsDeterministicos() };
    await expect(ingerir({ ...doc, fonte: "boato" as never }, deps)).rejects.toThrow(ErroConhecimento);
    await expect(ingerir({ ...doc, usuarioId: "x" }, deps)).rejects.toThrow(/usuarioId/);
    await expect(ingerir({ ...doc, texto: "  \n " }, deps)).rejects.toThrow(/texto/);
  });

  it("sem embeddings (EMBEDDINGS_PROVEDOR=nenhum): grava os trechos sem vetor", async () => {
    const { repo, gravados } = repoFalso();
    const r = await ingerir(doc, { repositorio: repo, embeddings: null });
    expect(r).toMatchObject({ novo: true, trechos: 2 });
    expect(gravados[0]!.trechos.map((t) => t.embedding)).toEqual([null, null]);
  });
});

describe("textoParaEmbedding", () => {
  it("põe o título antes do trecho, para o vetor saber de que documento veio", () => {
    expect(textoParaEmbedding("Taxas", "A taxa é 0,1%.")).toBe("Taxas\nA taxa é 0,1%.");
  });
});
