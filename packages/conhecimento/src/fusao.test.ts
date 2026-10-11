import { describe, expect, it } from "vitest";
import { fundirResultados, type OpcoesFusao } from "./fusao.js";

const DIA = 86_400_000;
const agora = new Date("2026-10-10T00:00:00Z");
const item = (id: string, fonte: "noticia" | "diario" | "nota", diasAtras = 0) => ({
  id,
  fonte,
  publicadoEm: new Date(agora.getTime() - diasAtras * DIA),
});

const neutras: OpcoesFusao = {
  agora,
  limite: 10,
  pesos: { diario: 1, noticia: 1, regra_corretora: 1, estrategia: 1, nota: 1 },
  meiaVidaDias: {
    diario: Infinity,
    noticia: Infinity,
    regra_corretora: Infinity,
    estrategia: Infinity,
    nota: Infinity,
  },
};

describe("fundirResultados (Reciprocal Rank Fusion)", () => {
  it("quem aparece bem nas duas listas fica na frente", () => {
    const vetorial = [item("a", "nota"), item("b", "nota"), item("c", "nota")];
    const textual = [item("b", "nota"), item("c", "nota")];
    expect(fundirResultados([vetorial, textual], neutras).map((r) => r.id)).toEqual(["b", "c", "a"]);
  });

  it("usa 1/(k + posição) com k = 60", () => {
    const [r] = fundirResultados([[item("a", "nota")], [item("a", "nota")]], neutras);
    expect(r!.pontuacao).toBeCloseTo(2 / 61, 10);
  });

  it("aplica o peso da fonte", () => {
    const pesos = { ...neutras.pesos, nota: 0.1 };
    const r = fundirResultados([[item("nota1", "nota"), item("diario1", "diario")]], { ...neutras, pesos });
    expect(r.map((x) => x.id)).toEqual(["diario1", "nota1"]);
  });

  it("notícia velha perde peso rápido; diário velho, devagar", () => {
    const meiaVidaDias = { ...neutras.meiaVidaDias, noticia: 2, diario: 365 };
    const r = fundirResultados([[item("noticia-velha", "noticia", 10), item("diario-velho", "diario", 10)]], {
      ...neutras,
      meiaVidaDias,
    });
    expect(r.map((x) => x.id)).toEqual(["diario-velho", "noticia-velha"]);
    const noticia = r.find((x) => x.id === "noticia-velha")!;
    expect(noticia.pontuacao).toBeCloseTo((1 / 61) * 0.5 ** 5, 10);
  });

  it("data no futuro não ganha bônus", () => {
    const meiaVidaDias = { ...neutras.meiaVidaDias, nota: 1 };
    const [r] = fundirResultados([[item("a", "nota", -5)]], { ...neutras, meiaVidaDias });
    expect(r!.pontuacao).toBeCloseTo(1 / 61, 10);
  });

  it("respeita o limite e não muda as listas recebidas", () => {
    const lista = [item("a", "nota"), item("b", "nota"), item("c", "nota")];
    const copia = [...lista];
    expect(fundirResultados([lista], { ...neutras, limite: 2 })).toHaveLength(2);
    expect(lista).toEqual(copia);
  });
});
