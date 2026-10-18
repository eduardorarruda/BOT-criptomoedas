import { DecisaoEsquema, PlacarEsquema } from "@zentrade/contratos/esquemas";
import { describe, expect, it } from "vitest";
import { estadoInicialDemo } from "./estado";
import { placarDemo } from "./placar";

const AGORA = Date.UTC(2026, 9, 17, 12, 0);

describe("placar do Claude no exemplo", () => {
  const estado = estadoInicialDemo(AGORA);

  it("as decisões do exemplo continuam válidas no contrato, com a avaliação nas entradas do Claude", () => {
    for (const d of estado.decisoes) DecisaoEsquema.parse(d);
    const vetos = estado.decisoes.filter((d) => d.avaliacao?.claude === "vetou");
    const aprovadas = estado.decisoes.filter((d) => d.avaliacao?.claude === "aprovou");
    expect(vetos.length).toBeGreaterThanOrEqual(20);
    expect(aprovadas.length).toBeGreaterThanOrEqual(15);
    expect(estado.decisoes.some((d) => d.avaliacao?.situacao === "pendente")).toBe(true);
    // do mais novo ao mais velho, como a API
    expect(estado.decisoes.map((d) => d.em)).toEqual(
      [...estado.decisoes.map((d) => d.em)].sort((a, b) => b - a),
    );
  });

  it("tem amostra para o placar (≥ 30 avaliadas), por robô, e é o mesmo a cada carregamento", () => {
    const p = PlacarEsquema.parse(placarDemo(estado, {}, AGORA));
    expect(p.total.avaliadas).toBeGreaterThanOrEqual(30);
    expect(p.total.moeda).toBe("USDT");
    expect(p.porRobo.length).toBeGreaterThanOrEqual(3);
    expect(placarDemo(estadoInicialDemo(AGORA), {}, AGORA)).toEqual(p);
  });

  it("filtra por robô e por data", () => {
    const sol = placarDemo(estado, { roboId: "r-sol" }, AGORA);
    expect(sol.porRobo.map((g) => g.chave)).toEqual(["r-sol"]);
    const semana = placarDemo(estado, { desde: AGORA - 7 * 86_400_000 }, AGORA);
    expect(semana.total.decisoes).toBeLessThan(placarDemo(estado, {}, AGORA).total.decisoes);
  });
});
