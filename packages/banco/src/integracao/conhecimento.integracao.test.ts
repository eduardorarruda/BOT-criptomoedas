import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { montarCenario, type Cenario } from "./ajuda.js";

const vetor = (v = 0.1) => new Array<number>(1024).fill(v);

describe("conhecimento sem embeddings e reindexação (sob RLS)", () => {
  let c: Cenario;
  beforeAll(async () => {
    c = await montarCenario();
  });
  afterAll(async () => c.encerrar());
  beforeEach(async () => {
    await c.banco.conexao.sql`delete from documentos`;
  });

  async function documento(usuarioId: string, titulo: string, embeddings: (number[] | null)[]) {
    const id = randomUUID();
    const trechos = embeddings.map((embedding, ordem) => ({
      id: randomUUID(),
      ordem,
      texto: `${titulo}, parte ${ordem}`,
      embedding,
    }));
    await c.banco.conhecimento.gravarDocumento(
      {
        id,
        usuarioId,
        fonte: "nota",
        titulo,
        url: null,
        publicadoEm: new Date(),
        hashConteudo: randomUUID(),
      },
      trechos,
    );
    return { id, trechos };
  }

  it("grava trechos sem vetor (EMBEDDINGS_PROVEDOR=nenhum) e ainda confere a dimensão de quem tem", async () => {
    await documento(c.ana.id, "Sem vetor", [null, null]);
    await documento(c.ana.id, "Misto", [vetor(), null]);
    expect(await c.banco.conhecimento.contarTrechosSemVetor(c.ana.id)).toBe(3);
    expect(await c.banco.conhecimento.contarTrechosSemVetor(c.beto.id)).toBe(0);
    await expect(documento(c.ana.id, "Errado", [[1, 2]])).rejects.toThrow(/1024 dimensões/);
  });

  it("lista as pessoas com trechos pendentes e entrega os trechos em lotes, com o título", async () => {
    const { trechos } = await documento(c.ana.id, "Plano", [null, null, null]);
    await documento(c.beto.id, "Do Beto", [null]);
    await documento(c.beto.id, "Pronto", [vetor()]);
    expect((await c.banco.conhecimento.pessoasComTrechosSemVetor()).sort()).toEqual(
      [c.ana.id, c.beto.id].sort(),
    );
    const lote = await c.banco.conhecimento.trechosSemVetor(c.ana.id, 2);
    expect(lote).toHaveLength(2);
    expect(lote[0]).toMatchObject({ titulo: "Plano", texto: expect.stringMatching(/^Plano, parte/) });
    expect(trechos.map((t) => t.id)).toEqual(expect.arrayContaining(lote.map((t) => t.id)));
    expect((await c.banco.conhecimento.trechosSemVetor(c.beto.id, 10)).map((t) => t.titulo)).toEqual([
      "Do Beto",
    ]);
  });

  it("grava os vetores só onde faltam, só da própria pessoa, e é idempotente", async () => {
    const { trechos } = await documento(c.ana.id, "Plano", [null, null]);
    const vetores = trechos.map((t) => ({ id: t.id, embedding: vetor(0.2) }));
    // Outra pessoa não grava no trecho da Ana: o RLS esconde a linha.
    expect(await c.banco.conhecimento.gravarVetores(c.beto.id, vetores)).toBe(0);
    expect(await c.banco.conhecimento.gravarVetores(c.ana.id, vetores.slice(0, 1))).toBe(1);
    expect(await c.banco.conhecimento.contarTrechosSemVetor(c.ana.id)).toBe(1);
    expect(await c.banco.conhecimento.gravarVetores(c.ana.id, vetores)).toBe(1);
    expect(await c.banco.conhecimento.gravarVetores(c.ana.id, vetores)).toBe(0);
    expect(await c.banco.conhecimento.pessoasComTrechosSemVetor()).toEqual([]);
    await expect(
      c.banco.conhecimento.gravarVetores(c.ana.id, [{ id: trechos[0]!.id, embedding: [1] }]),
    ).rejects.toThrow(/1024 dimensões/);
    expect(await c.banco.conhecimento.gravarVetores(c.ana.id, [])).toBe(0);
  });
});
