import { describe, expect, it } from "vitest";
import { lerCenario, type SerieMercado } from "./regime.js";

const HORA = 3_600_000;

/** Máximas e mínimas a 0,5% do fechamento: dá ATR sem inventar tendência. */
const serieDe = (fechamentos: number[]): SerieMercado => ({
  fechamentos,
  maximas: fechamentos.map((f) => f * 1.005),
  minimas: fechamentos.map((f) => f * 0.995),
});

const reta = (de: number, ate: number, n: number): number[] =>
  Array.from({ length: n }, (_, i) => de + ((ate - de) * i) / (n - 1));

describe("cenário de mercado", () => {
  it("alta: preço acima da média de 200 e a média subindo mais que o limiar", () => {
    const r = lerCenario(serieDe(reta(100, 200, 500)), { intervaloMs: HORA });
    expect(r.cenario).toBe("alta");
    expect(r.precoVsSma200).toBeGreaterThan(0);
    expect(r.inclinacaoSma200).toBeGreaterThan(r.limiarInclinacao ?? Infinity);
    expect(r.precoVsSma400).toBeGreaterThan(0);
    expect(r.texto).toMatch(/^Alta: o preço está [\d,]+% acima da média de 200 velas, que sobe /);
  });

  it("queda: o espelho da alta", () => {
    const r = lerCenario(serieDe(reta(200, 100, 500)), { intervaloMs: HORA });
    expect(r.cenario).toBe("queda");
    expect(r.precoVsSma200).toBeLessThan(0);
    expect(r.inclinacaoSma200).toBeLessThan(0);
    expect(r.texto).toMatch(/^Queda: o preço está [\d,]+% abaixo da média de 200 velas, que cai /);
  });

  it("lateral: preço 0,4% abaixo de uma média parada, com os números e a frase do pedido", () => {
    const fechamentos = [...Array<number>(499).fill(100), 99.6];
    const r = lerCenario(serieDe(fechamentos), { intervaloMs: HORA });
    expect(r.cenario).toBe("lateral");
    expect(r.precoVsSma200).toBe(-0.4);
    expect(r.inclinacaoSma200).toBeCloseTo(0, 1);
    expect(r.variacao7d).toBe(-0.4);
    expect(r.texto).toBe(
      "Lateral: o preço está 0,4% abaixo da média de 200 velas, que está quase parada; em 7 dias andou -0,4%.",
    );
  });

  it("preço acima da média, mas a média caindo (repique dentro de uma queda): lateral", () => {
    const fechamentos = [...reta(300, 100, 499), 400];
    const r = lerCenario(serieDe(fechamentos), { intervaloMs: HORA });
    expect(r.cenario).toBe("lateral");
    expect(r.precoVsSma200).toBeGreaterThan(0);
    expect(r.inclinacaoSma200).toBeLessThan(0);
    expect(r.texto).toContain("que cai");
  });

  it("sem velas suficientes não chuta: indefinido, dizendo quantas faltam", () => {
    const r = lerCenario(serieDe(reta(100, 120, 100)), { intervaloMs: HORA });
    expect(r.cenario).toBe("indefinido");
    expect(r.precoVsSma200).toBeNull();
    expect(r.texto).toBe("Sem histórico para o cenário: faltam 150 velas (precisa de 250).");
  });

  it("variação de 7 dias: compara com a vela de 168 horas atrás", () => {
    const fechamentos = [...Array<number>(499).fill(100), 110];
    const r = lerCenario(serieDe(fechamentos), { intervaloMs: HORA });
    expect(r.variacao7d).toBe(10);
    expect(r.janelaVariacaoHoras).toBe(168);
  });

  it("variação com menos de 7 dias de velas usa a janela que existe e diz qual é", () => {
    const fechamentos = [...Array<number>(299).fill(100), 101];
    const r = lerCenario(serieDe(fechamentos), { intervaloMs: 5 * 60_000 });
    expect(r.janelaVariacaoHoras).toBeCloseTo((299 * 5) / 60, 1);
    expect(r.variacao7d).toBe(1);
  });

  it("eficiência de Kaufman: reta limpa = 1; vai e volta = perto de 0", () => {
    const limpa = lerCenario(serieDe(reta(100, 200, 500)), { intervaloMs: HORA });
    expect(limpa.eficiencia).toBe(1);
    const serrote = Array.from({ length: 500 }, (_, i) => (i % 2 === 0 ? 100 : 101));
    const ruido = lerCenario(serieDe(serrote), { intervaloMs: HORA });
    expect(ruido.eficiencia).toBeLessThan(0.1);
  });

  it("ATR% e seu percentil entre as últimas velas; sem máxima e mínima ficam nulos", () => {
    const calmo = Array.from({ length: 500 }, () => 100);
    const comAtr = lerCenario(serieDe(calmo), { intervaloMs: HORA });
    expect(comAtr.atrPct).toBeCloseTo(1, 1);
    expect(comAtr.atrPercentil).not.toBeNull();
    const sem = lerCenario({ fechamentos: calmo }, { intervaloMs: HORA });
    expect(sem.atrPct).toBeNull();
    expect(sem.atrPercentil).toBeNull();
    expect(sem.cenario).toBe("lateral");
  });

  it("não olha o futuro: velas acrescentadas depois não mudam a leitura do passado", () => {
    const tudo = reta(100, 200, 600);
    const antes = lerCenario(serieDe(tudo.slice(0, 500)), { intervaloMs: HORA });
    const denovo = lerCenario(serieDe(tudo.slice(0, 500)), { intervaloMs: HORA });
    expect(denovo).toEqual(antes);
    expect(lerCenario(serieDe(tudo), { intervaloMs: HORA })).not.toEqual(antes);
  });
});
