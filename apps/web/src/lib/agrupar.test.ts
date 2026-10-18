import { afterEach, describe, expect, it } from "vitest";
import { agruparPorDia } from "./agrupar";
import { definirFusoDaInstancia } from "./fuso";

afterEach(() => definirFusoDaInstancia("America/Sao_Paulo"));

const AGORA = Date.UTC(2026, 9, 10, 15, 0); // 12:00 em São Paulo

describe("agruparPorDia", () => {
  it("separa hoje, ontem e datas anteriores, na ordem recebida", () => {
    const itens = [AGORA - 1000, AGORA - 2 * 3_600_000, AGORA - 26 * 3_600_000, AGORA - 4 * 86_400_000];
    const grupos = agruparPorDia(itens, (x) => x, AGORA);
    expect(grupos.map((g) => g.titulo)).toEqual(["Hoje", "Ontem", "terça-feira, 06 de outubro"]);
    expect(grupos[0]?.itens).toHaveLength(2);
  });

  it("o dia é o do fuso da instância (às 22:52 de Brasília ainda é hoje, 17/10)", () => {
    const noite = Date.parse("2026-10-18T01:52:00Z");
    const grupos = agruparPorDia(
      [Date.parse("2026-10-17T23:00:00Z"), Date.parse("2026-10-17T02:00:00Z")],
      (x) => x,
      noite,
    );
    expect(grupos.map((g) => g.titulo)).toEqual(["Hoje", "Ontem"]);
    definirFusoDaInstancia("America/New_York");
    // 23:30 de 17/10 em New York, vista à 00:30 de 18/10: ontem lá (em Brasília seria hoje)
    const ny = agruparPorDia(
      [Date.parse("2026-10-18T03:30:00Z")],
      (x) => x,
      Date.parse("2026-10-18T04:30:00Z"),
    );
    expect(ny.map((g) => g.titulo)).toEqual(["Ontem"]);
  });

  it("devolve lista vazia sem itens", () => {
    expect(agruparPorDia([], (x: number) => x, AGORA)).toEqual([]);
  });
});
