import { describe, expect, it, vi } from "vitest";
import { criarEmbeddingsDeterministicos } from "./embeddings/deterministicos.js";
import type { Embeddings } from "./embeddings/tipos.js";
import { reindexar, type RepositorioReindexacao } from "./reindexacao.js";
import { ErroConhecimento } from "./tipos.js";

const ANA = "11111111-1111-4111-8111-111111111111";
const BETO = "22222222-2222-4222-8222-222222222222";

interface TrechoFalso {
  readonly id: string;
  readonly usuarioId: string;
  readonly titulo: string;
  readonly texto: string;
  embedding: readonly number[] | null;
}

/** Repositório em memória: guarda os vetores como o banco guardaria (por trecho, por pessoa). */
function repoEmMemoria(trechos: TrechoFalso[], o: { gravaNada?: boolean } = {}) {
  const pendentes = (usuarioId: string) =>
    trechos.filter((t) => t.usuarioId === usuarioId && t.embedding === null);
  const repo: RepositorioReindexacao = {
    pessoasComTrechosSemVetor: vi.fn(async () => [
      ...new Set(trechos.filter((t) => t.embedding === null).map((t) => t.usuarioId)),
    ]),
    contarTrechosSemVetor: vi.fn(async (usuarioId: string) => pendentes(usuarioId).length),
    trechosSemVetor: vi.fn(async (usuarioId: string, limite: number) =>
      pendentes(usuarioId)
        .slice(0, limite)
        .map(({ id, titulo, texto }) => ({ id, titulo, texto })),
    ),
    gravarVetores: vi.fn(async (usuarioId: string, vetores) => {
      if (o.gravaNada) return 0;
      let gravados = 0;
      for (const v of vetores) {
        const alvo = trechos.find((t) => t.id === v.id && t.usuarioId === usuarioId && t.embedding === null);
        if (alvo) {
          alvo.embedding = v.embedding;
          gravados++;
        }
      }
      return gravados;
    }),
  };
  return repo;
}

const trecho = (id: string, usuarioId: string, embedding: number[] | null = null): TrechoFalso => ({
  id,
  usuarioId,
  titulo: `Título ${id}`,
  texto: `texto ${id}`,
  embedding,
});

describe("reindexar (backfill dos embeddings)", () => {
  it("calcula os vetores que faltam, por pessoa e em lotes, avisando o progresso", async () => {
    const base = [trecho("a1", ANA), trecho("a2", ANA), trecho("a3", ANA), trecho("b1", BETO)];
    const repo = repoEmMemoria(base);
    const embeddings = criarEmbeddingsDeterministicos();
    const gerar = vi.spyOn(embeddings, "gerar");
    const progresso = vi.fn();

    const r = await reindexar({ repositorio: repo, embeddings, tamanhoLote: 2, aoProgresso: progresso });

    expect(r).toEqual({ pessoas: 2, trechos: 4 });
    expect(base.every((t) => t.embedding?.length === 1024)).toBe(true);
    expect(gerar.mock.calls.map(([textos]) => textos.length)).toEqual([2, 1, 1]);
    expect(gerar).toHaveBeenCalledWith(["Título a1\ntexto a1", "Título a2\ntexto a2"], "documento");
    expect(progresso.mock.calls.map(([p]) => p)).toEqual([
      { usuarioId: ANA, feitos: 2, total: 3 },
      { usuarioId: ANA, feitos: 3, total: 3 },
      { usuarioId: BETO, feitos: 1, total: 1 },
    ]);
  });

  it("é idempotente: sem trecho pendente, não gasta embeddings", async () => {
    const repo = repoEmMemoria([trecho("a1", ANA, new Array(1024).fill(0.1))]);
    const embeddings = criarEmbeddingsDeterministicos();
    const gerar = vi.spyOn(embeddings, "gerar");
    await expect(reindexar({ repositorio: repo, embeddings })).resolves.toEqual({ pessoas: 0, trechos: 0 });
    expect(gerar).not.toHaveBeenCalled();
  });

  it("retoma de onde parou: o lote gravado antes da falha não é recalculado", async () => {
    const base = [trecho("a1", ANA), trecho("a2", ANA), trecho("a3", ANA)];
    const repo = repoEmMemoria(base);
    const reais = criarEmbeddingsDeterministicos();
    let chamadas = 0;
    const instavel: Embeddings = {
      dimensoes: 1024,
      gerar: async (textos, tipo) => {
        chamadas++;
        if (chamadas === 2) throw new Error("caiu a rede");
        return reais.gerar(textos, tipo);
      },
    };
    await expect(reindexar({ repositorio: repo, embeddings: instavel, tamanhoLote: 2 })).rejects.toThrow(
      /caiu a rede/,
    );
    expect(base.map((t) => t.embedding !== null)).toEqual([true, true, false]);

    const gerar = vi.spyOn(reais, "gerar");
    await expect(reindexar({ repositorio: repo, embeddings: reais, tamanhoLote: 2 })).resolves.toEqual({
      pessoas: 1,
      trechos: 1,
    });
    expect(gerar).toHaveBeenCalledExactlyOnceWith(["Título a3\ntexto a3"], "documento");
  });

  it("pode se limitar às pessoas pedidas", async () => {
    const base = [trecho("a1", ANA), trecho("b1", BETO)];
    const repo = repoEmMemoria(base);
    const r = await reindexar({
      repositorio: repo,
      embeddings: criarEmbeddingsDeterministicos(),
      usuarioIds: [BETO],
    });
    expect(r).toEqual({ pessoas: 1, trechos: 1 });
    expect(base.map((t) => t.embedding !== null)).toEqual([false, true]);
    expect(repo.pessoasComTrechosSemVetor).not.toHaveBeenCalled();
  });

  it("para com erro claro se o banco não gravar nada (em vez de repetir o lote para sempre)", async () => {
    const repo = repoEmMemoria([trecho("a1", ANA)], { gravaNada: true });
    await expect(
      reindexar({ repositorio: repo, embeddings: criarEmbeddingsDeterministicos() }),
    ).rejects.toThrow(ErroConhecimento);
  });

  it("recusa tamanho de lote inválido", async () => {
    const repo = repoEmMemoria([]);
    const embeddings = criarEmbeddingsDeterministicos();
    await expect(reindexar({ repositorio: repo, embeddings, tamanhoLote: 0 })).rejects.toThrow(/lote/);
    await expect(reindexar({ repositorio: repo, embeddings, tamanhoLote: 1.5 })).rejects.toThrow(/lote/);
  });
});
