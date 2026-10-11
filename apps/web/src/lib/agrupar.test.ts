import { describe, expect, it } from "vitest";
import { agruparPorDia } from "./agrupar";

const AGORA = Date.UTC(2026, 9, 10, 15, 0); // 12:00 em São Paulo

describe("agruparPorDia", () => {
  it("separa hoje, ontem e datas anteriores, na ordem recebida", () => {
    const itens = [AGORA - 1000, AGORA - 2 * 3_600_000, AGORA - 26 * 3_600_000, AGORA - 4 * 86_400_000];
    const grupos = agruparPorDia(itens, (x) => x, AGORA);
    expect(grupos.map((g) => g.titulo)).toEqual(["Hoje", "Ontem", "terça-feira, 06 de outubro"]);
    expect(grupos[0]?.itens).toHaveLength(2);
  });

  it("devolve lista vazia sem itens", () => {
    expect(agruparPorDia([], (x: number) => x, AGORA)).toEqual([]);
  });
});
