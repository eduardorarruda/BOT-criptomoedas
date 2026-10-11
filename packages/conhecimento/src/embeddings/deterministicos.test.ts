import { describe, expect, it } from "vitest";
import { criarEmbeddingsDeterministicos } from "./deterministicos.js";

const cosseno = (a: number[], b: number[]): number => a.reduce((s, x, i) => s + x * b[i]!, 0);

describe("embeddings determinísticos (testes e desenvolvimento sem custo)", () => {
  const emb = criarEmbeddingsDeterministicos();

  it("devolve vetores normalizados de 1024 dimensões, sempre iguais para o mesmo texto", async () => {
    const [a, b] = await emb.gerar(["taxa de saque", "taxa de saque"], "documento");
    expect(a).toHaveLength(1024);
    expect(a).toEqual(b);
    expect(cosseno(a!, a!)).toBeCloseTo(1, 6);
  });

  it("textos com palavras em comum ficam mais próximos que textos sem nada em comum", async () => {
    const [consulta, perto, longe] = await emb.gerar(
      ["qual a taxa de saque da corretora", "a taxa de saque cobrada pela corretora", "bolo de cenoura"],
      "consulta",
    );
    expect(cosseno(consulta!, perto!)).toBeGreaterThan(cosseno(consulta!, longe!));
  });

  it("texto sem palavras vira vetor válido (não NaN)", async () => {
    const [v] = await emb.gerar(["!!!"], "documento");
    expect(v!.every((x) => Number.isFinite(x))).toBe(true);
  });
});
