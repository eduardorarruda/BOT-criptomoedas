import { describe, expect, it } from "vitest";
import { medirRecall } from "./recall.js";

describe("medirRecall", () => {
  const casos = [
    { pergunta: "p1", esperados: ["A"] },
    { pergunta: "p2", esperados: ["B", "C"] },
    { pergunta: "p3", esperados: ["D"] },
  ];
  const respostas: Record<string, string[]> = { p1: ["A", "X"], p2: ["X", "C"], p3: ["X", "Y", "D"] };

  it("conta acerto quando algum esperado está entre os k primeiros", async () => {
    const r = await medirRecall(casos, async (p) => respostas[p]!, 2);
    expect(r.recall).toBeCloseTo(2 / 3);
    expect(r.falhas).toEqual([{ pergunta: "p3", esperados: ["D"], vistos: ["X", "Y"] }]);
  });

  it("recusa conjunto vazio", async () => {
    await expect(medirRecall([], async () => [], 5)).rejects.toThrow(/vazio/);
  });
});
