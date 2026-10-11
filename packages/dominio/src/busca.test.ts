import { describe, expect, it } from "vitest";
import { limiteInferior, recorte } from "./busca.js";

const ts = [10, 20, 20, 30, 40].map((t) => ({ t }));
const chave = (x: { t: number }) => x.t;

describe("busca binária", () => {
  it("acha o primeiro índice com chave maior ou igual ao alvo", () => {
    expect(limiteInferior(ts, 20, chave)).toBe(1);
    expect(limiteInferior(ts, 25, chave)).toBe(3);
    expect(limiteInferior(ts, 5, chave)).toBe(0);
    expect(limiteInferior(ts, 99, chave)).toBe(5);
    expect(limiteInferior([], 1, chave)).toBe(0);
  });

  it("recorta a janela [início, fim) sem varrer a lista", () => {
    expect(recorte(ts, 20, 40, chave).map(chave)).toEqual([20, 20, 30]);
    expect(recorte(ts, 41, 50, chave)).toEqual([]);
  });

  it("recusa janela invertida", () => {
    expect(() => recorte(ts, 40, 20, chave)).toThrow(/janela/);
  });
});
