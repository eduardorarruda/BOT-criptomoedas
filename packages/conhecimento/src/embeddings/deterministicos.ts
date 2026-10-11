import { createHash } from "node:crypto";
import { DIMENSOES, type Embeddings } from "./tipos.js";

const palavras = (texto: string): string[] => texto.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];

function posicao(palavra: string): { indice: number; sinal: 1 | -1 } {
  const h = createHash("sha256").update(palavra).digest();
  return { indice: h.readUInt32BE(0) % DIMENSOES, sinal: (h[4] ?? 0) % 2 === 0 ? 1 : -1 };
}

function vetorDe(texto: string): number[] {
  const v = new Array<number>(DIMENSOES).fill(0);
  for (const p of palavras(texto)) {
    const { indice, sinal } = posicao(p);
    v[indice] = (v[indice] ?? 0) + sinal;
  }
  const norma = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  if (norma === 0) return v.map((_, i) => (i === 0 ? 1 : 0));
  return v.map((x) => x / norma);
}

/**
 * "Saco de palavras" com hashing: textos que dividem palavras ficam próximos. Não é
 * semântico de verdade — serve para testes e para desenvolver sem pagar embeddings.
 */
export function criarEmbeddingsDeterministicos(): Embeddings {
  return {
    dimensoes: DIMENSOES,
    gerar: async (textos) => textos.map(vetorDe),
  };
}
