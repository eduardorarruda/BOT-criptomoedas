import { describe, expect, it } from "vitest";
import { compararReplay, metricasDe, type SinalAvaliado } from "./comparacao.js";

const sinal = (i: number, aprovou: boolean, retorno: number): SinalAvaliado => ({
  simbolo: "BTCUSDT",
  ate: i,
  aprovou,
  retorno,
  resultadoUsd: retorno * 1000,
});

const OPCOES = { rodadas: 1000, semente: 1 };

describe("métricas de um conjunto", () => {
  it("acerto, ganho e perda médios e somas em % e em US$", () => {
    const m = metricasDe([
      sinal(1, true, 0.1),
      sinal(2, true, -0.02),
      sinal(3, false, 0.04),
      sinal(4, false, -0.04),
    ]);
    expect(m.n).toBe(4);
    expect(m.acerto).toBe(0.5);
    expect(m.ganhoMedioPct).toBeCloseTo(7);
    expect(m.perdaMediaPct).toBeCloseTo(-3);
    expect(m.somaPct).toBeCloseTo(8);
    expect(m.mediaPct).toBeCloseTo(2);
    expect(m.somaUsd).toBeCloseTo(80);
  });

  it("conjunto vazio não inventa médias", () => {
    expect(metricasDe([])).toMatchObject({
      n: 0,
      acerto: null,
      ganhoMedioPct: null,
      perdaMediaPct: null,
      somaUsd: 0,
    });
  });
});

describe("comparação regra pura × regra + Claude × acaso", () => {
  // 60 sinais: 20 ganham +10%, 40 perdem −3%.
  const base = Array.from({ length: 60 }, (_, i) => (i < 20 ? 0.1 : -0.03));

  it("Claude que aprova só os vencedores fica acima do p95 do acaso: agrega", () => {
    const lista = base.map((r, i) => sinal(i, r > 0, r));
    const c = compararReplay(lista, OPCOES);
    expect(c.veredito).toBe("agrega");
    expect(c.aprovacoes).toMatchObject({ acertos: 20, total: 20, taxa: 1 });
    expect(c.vetos).toMatchObject({ acertos: 40, total: 40, taxa: 1 });
    expect(c.aprovacoes.intervalo.inferior).toBeGreaterThan(0.8);
    expect(c.aleatorio?.sorteadas).toBe(20);
    expect(c.aleatorio?.acasoIgualouOuMelhorou).toBe(0);
    expect(c.diferencaParaPuroUsd).toBeCloseTo(-(40 * -30)); // tirou os 40 perdedores: +1200 contra a regra pura
  });

  it("Claude que aprova só os perdedores fica abaixo do p5 do acaso: tira", () => {
    const c = compararReplay(
      base.map((r, i) => sinal(i, r < 0, r)),
      OPCOES,
    );
    expect(c.veredito).toBe("tira");
    expect(c.aprovacoes.taxa).toBe(0);
  });

  it("aprovação sem relação com o resultado é indistinguível do acaso", () => {
    const lista = base.map((r, i) => sinal(i, i % 3 === 0, r)); // 1 em cada 3, alternando entre vencedores e perdedores
    const c = compararReplay(lista, OPCOES);
    expect(c.veredito).toBe("indistinguivel");
    expect(c.taxaDeAprovacao).toBeCloseTo(1 / 3);
  });

  it("aprovar tudo ou nada não é filtro: o acaso nem entra", () => {
    expect(
      compararReplay(
        base.map((r, i) => sinal(i, true, r)),
        OPCOES,
      ),
    ).toMatchObject({
      veredito: "sem_filtro",
      aleatorio: null,
    });
    expect(
      compararReplay(
        base.map((r, i) => sinal(i, false, r)),
        OPCOES,
      ).veredito,
    ).toBe("sem_filtro");
    expect(compararReplay([], OPCOES).veredito).toBe("sem_filtro");
  });

  it("é determinístico: a mesma semente dá o mesmo acaso", () => {
    const lista = base.map((r, i) => sinal(i, i % 3 === 0, r));
    expect(compararReplay(lista, OPCOES).aleatorio).toEqual(compararReplay(lista, OPCOES).aleatorio);
  });
});
