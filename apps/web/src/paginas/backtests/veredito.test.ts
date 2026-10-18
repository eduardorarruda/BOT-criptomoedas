import { describe, expect, it } from "vitest";
import type { Backtest } from "../../api/esquemas";
import { comTentativasDemo } from "../../demo/backtestDemo";
import { backtestsIniciais } from "../../demo/historico";
import { resumoDoVeredito, veredito } from "./veredito";

const AGORA = Date.UTC(2026, 9, 1);
const [bom, ruim, , antigo] = comTentativasDemo(backtestsIniciais(AGORA)) as [
  Backtest,
  Backtest,
  Backtest,
  Backtest,
];
const tons = (b: Backtest) => Object.fromEntries(veredito(b).map((c) => [c.id, c.tom]));

describe("veredito do backtest", () => {
  it("backtest robusto do exemplo: maioria verde", () => {
    const t = tons(bom);
    expect(t).toMatchObject({ lucro: "verde", operacoes: "verde", fora: "verde", limites: "verde" });
    expect(Object.keys(t)).toEqual([
      "lucro",
      "buy_hold",
      "operacoes",
      "fora",
      "janelas",
      "ruina",
      "dsr",
      "periodo",
      "limites",
    ]);
  });

  it("backtest frágil do exemplo: perde para o buy and hold e falha fora da amostra", () => {
    const t = tons(ruim);
    expect(t.fora).toBe("vermelho");
    expect(t.limites).toBe("amarelo");
    expect(veredito(ruim).some((c) => c.tom === "vermelho")).toBe(true);
  });

  it("backtest antigo: só o que dá para saber, e o aviso de que é antigo", () => {
    const c = veredito(antigo);
    expect(c.map((x) => x.id)).toEqual(["lucro", "operacoes", "limites"]);
    expect(c.at(-1)).toMatchObject({ tom: "amarelo", titulo: "Backtest antigo, de antes da validação" });
  });

  it("cortes das regras práticas", () => {
    const com = (metricas: Partial<NonNullable<Backtest["metricas"]>>): Backtest => ({
      ...bom,
      metricas: { ...bom.metricas!, ...metricas },
    });
    expect(tons(com({ operacoes: 100 })).operacoes).toBe("verde");
    expect(tons(com({ operacoes: 99 })).operacoes).toBe("amarelo");
    expect(tons(com({ operacoes: 29 })).operacoes).toBe("vermelho");
    expect(tons(com({ excessoSobreBuyHold: -0.005 })).buy_hold).toBe("amarelo");
    expect(tons(com({ excessoSobreBuyHold: -0.05 })).buy_hold).toBe("vermelho");
    expect(tons(com({ resultadoLiquido: "-1" })).lucro).toBe("vermelho");
    expect(tons(com({ anos: 0.5 })).periodo).toBe("amarelo");
  });

  it("nunca recomenda investir ou operar", () => {
    const textos = [bom, ruim, antigo].flatMap((b) => veredito(b).flatMap((c) => [c.titulo, c.detalhe]));
    for (const t of textos) expect(t).not.toMatch(/recomend|invista|compre|deveria operar|pode operar/i);
  });

  it("resumo conta as cores", () => {
    expect(
      resumoDoVeredito([
        { id: "a", tom: "verde", titulo: "", detalhe: "" },
        { id: "b", tom: "vermelho", titulo: "", detalhe: "" },
      ]),
    ).toBe("2 verificações: 1 verde, 0 amarelas, 1 vermelha.");
  });
});

describe("veredito do mini índice (WIN)", () => {
  const win = comTentativasDemo(backtestsIniciais(AGORA)).find((b) => b.simbolo === "WIN-IBOV")!;
  const comWin = (mudanca: Partial<NonNullable<NonNullable<Backtest["metricas"]>["win"]>>): Backtest => ({
    ...win,
    metricas: { ...win.metricas!, win: { ...win.metricas!.win!, ...mudanca } },
  });

  it("checagens do WIN: IR, custos sobre o bruto, sessão e a aproximação", () => {
    const ids = veredito(win).map((c) => c.id);
    expect(ids.slice(0, 5)).toEqual(["lucro", "ir", "custos", "buy_hold", "dados"]);
    expect(tons(win)).toMatchObject({ dados: "amarelo" });
    const sessao = veredito(win).find((c) => c.id === "buy_hold");
    expect(sessao?.titulo).toMatch(/sempre comprado na sessão/);
    expect(veredito(win).find((c) => c.id === "lucro")?.detalhe).toMatch(/ficar de fora daria R\$ 0,00/);
  });

  it("custos consomem X% do ganho bruto: verde, amarelo, vermelho e sem bruto", () => {
    const custos = (f: number | null) =>
      veredito(comWin({ custosSobreBruto: f })).find((c) => c.id === "custos");
    expect(custos(0.2)).toMatchObject({ tom: "verde", titulo: "Custos consomem 20% do ganho bruto" });
    expect(custos(0.45)?.tom).toBe("amarelo");
    expect(custos(0.8)?.tom).toBe("vermelho");
    expect(custos(null)).toMatchObject({
      tom: "vermelho",
      titulo: "Sem ganho bruto: os custos só aumentaram a perda",
    });
  });

  it("depois do IR, dados reais e sinais sem espaço no risco", () => {
    expect(tons(comWin({ liquidoDepoisDoIr: "-1" })).ir).toBe("vermelho");
    expect(tons(comWin({ liquidoDepoisDoIr: "10" })).ir).toBe("verde");
    expect(tons(comWin({ aproximacao: false })).dados).toBe("verde");
    expect(tons(comWin({ semEspacoNoRisco: 3 })).sem_espaco).toBe("amarelo");
    expect(tons(comWin({ semEspacoNoRisco: 0 })).sem_espaco).toBeUndefined();
  });
});
