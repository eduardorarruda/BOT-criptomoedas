import type { Embeddings, RepositorioReindexacao } from "@zentrade/conhecimento";
import { describe, expect, it, vi } from "vitest";
import { embeddingsParaReindexar, executarReindexacao, type DependenciasReindexacao } from "./reindexar.js";

const ANA = "11111111-1111-4111-8111-111111111111";
const embeddings: Embeddings = {
  dimensoes: 1024,
  gerar: async (textos) => textos.map(() => new Array<number>(1024).fill(0.1)),
};

/** Banco em memória: três trechos da Ana sem vetor. */
function bancoFalso() {
  const pendentes = new Map([
    ["t1", { titulo: "Plano", texto: "a" }],
    ["t2", { titulo: "Plano", texto: "b" }],
    ["t3", { titulo: "Plano", texto: "c" }],
  ]);
  const conhecimento: RepositorioReindexacao = {
    pessoasComTrechosSemVetor: async () => (pendentes.size > 0 ? [ANA] : []),
    contarTrechosSemVetor: async () => pendentes.size,
    trechosSemVetor: async (_u, limite) =>
      [...pendentes.entries()].slice(0, limite).map(([id, t]) => ({ id, ...t })),
    gravarVetores: async (_u, vetores) => vetores.filter((v) => pendentes.delete(v.id)).length,
  };
  const porEmail = vi.fn(async (email: string) => (email === "ana@exemplo.com" ? { id: ANA } : null));
  const banco = { conhecimento, usuarios: { porEmail } } as unknown as DependenciasReindexacao["banco"];
  return { banco, pendentes, porEmail };
}

describe("comando reindexar-conhecimento", () => {
  it("calcula os vetores que faltam em lotes, mostra o progresso e o resumo", async () => {
    const { banco, pendentes } = bancoFalso();
    const linhas: string[] = [];
    const r = await executarReindexacao(["--lote", "2"], {
      banco,
      embeddings: { embeddings },
      escrever: (l) => linhas.push(l),
    });
    expect(r).toEqual({ pessoas: 1, trechos: 3 });
    expect(pendentes.size).toBe(0);
    expect(linhas).toEqual([
      `${ANA}: 2/3 trechos`,
      `${ANA}: 3/3 trechos`,
      "pronto: 3 trechos de 1 pessoa ganharam embeddings.",
    ]);
  });

  it("rodar de novo sem nada pendente avisa e não gasta embeddings", async () => {
    const { banco } = bancoFalso();
    const gerar = vi.fn(embeddings.gerar);
    const deps = { banco, embeddings: { embeddings: { ...embeddings, gerar } }, escrever: () => undefined };
    await executarReindexacao([], deps);
    gerar.mockClear();
    const linhas: string[] = [];
    await executarReindexacao([], { ...deps, escrever: (l) => linhas.push(l) });
    expect(gerar).not.toHaveBeenCalled();
    expect(linhas).toEqual(["nada a fazer: todos os trechos já têm embeddings."]);
  });

  it("--email limita a uma pessoa; e-mail desconhecido é erro claro", async () => {
    const { banco, porEmail } = bancoFalso();
    const deps = { banco, embeddings: { embeddings }, escrever: () => undefined };
    await expect(executarReindexacao(["--email", "ana@exemplo.com"], deps)).resolves.toEqual({
      pessoas: 1,
      trechos: 3,
    });
    expect(porEmail).toHaveBeenCalledWith("ana@exemplo.com");
    await expect(executarReindexacao(["--email", "ze@exemplo.com"], deps)).rejects.toThrow(
      /nenhuma pessoa com o e-mail/,
    );
    await expect(executarReindexacao(["--email", "nao-e-email"], deps)).rejects.toThrow(/--email/);
    await expect(executarReindexacao(["--lote", "0"], deps)).rejects.toThrow(/--lote/);
  });

  it("sem provedor de verdade, explica o que configurar", () => {
    expect(() => embeddingsParaReindexar({ embeddings: null })).toThrow(
      /EMBEDDINGS_PROVEDOR=nenhum.*voyage.*ollama/,
    );
    expect(() => embeddingsParaReindexar({ indisponivel: "VOYAGE_API_KEY não está definida" })).toThrow(
      /VOYAGE_API_KEY/,
    );
    expect(embeddingsParaReindexar({ embeddings })).toBe(embeddings);
  });
});
