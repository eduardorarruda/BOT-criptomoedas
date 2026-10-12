import type { Backtest, TentativaBacktest } from "@zentrade/banco";
import { describe, expect, it } from "vitest";
import { comTentativas, tentativasDo } from "./backtests-tentativas.js";

const metricas = {
  resultadoLiquido: "50",
  maiorQueda: "10",
  maiorQuedaPercentual: 0.01,
  operacoes: 120,
  acertos: 60,
  taxaAcerto: 0.5,
  taxasPagas: "3",
  sharpe: 1.4,
  observacoes: 8760,
  barrasPorAno: 8760,
  assimetria: 0,
  curtose: 3,
  anos: 1,
};

const backtest = (extra: Partial<Backtest> = {}): Backtest => ({
  id: "b3",
  estrategiaId: "e1",
  versao: 2,
  simbolo: "BTCUSDT",
  intervalo: "1h",
  inicio: 0,
  fim: 1,
  estado: "concluido",
  metricas,
  curva: [],
  configuracao: null,
  validacao: null,
  erro: null,
  criadoEm: 300,
  concluidoEm: 301,
  ...extra,
});

const tentativa = (
  id: string,
  versao: number,
  criadoEm: number,
  sharpe: number | null,
  estrategiaId = "e1",
) => ({
  id,
  estrategiaId,
  versao,
  criadoEm,
  sharpe,
});

const TODAS: TentativaBacktest[] = [
  tentativa("b1", 1, 100, -0.3),
  tentativa("b2", 1, 200, 0.6),
  tentativa("b3", 2, 300, 1.4),
  tentativa("b4", 2, 400, 2.5),
  tentativa("x1", 1, 50, 3, "outra"),
];

describe("tentativas de um backtest", () => {
  it("conta só a mesma estratégia, até este backtest, com ele incluído", () => {
    const t = tentativasDo(backtest(), TODAS)!;
    expect(t).toMatchObject({ total: 3, daVersao: 1, versoes: 2 });
    expect(t.sharpeDeflacionado).toBeLessThan(t.probabilidadeSharpe ?? 0);
    expect(t.sharpeMaximoEsperado).toBeGreaterThan(0);
    expect(t.anosMinimos).toBeGreaterThan(0);
  });

  it("a primeira tentativa: DSR = PSR, sem duração mínima", () => {
    const t = tentativasDo(
      backtest({ id: "b1", versao: 1, criadoEm: 100, metricas: { ...metricas, sharpe: -0.3 } }),
      TODAS,
    )!;
    expect(t.total).toBe(1);
    expect(t.sharpeDeflacionado).toBeCloseTo(t.probabilidadeSharpe ?? -1, 12);
    expect(t.anosMinimos).toBeNull();
  });

  it("não concluído ou sem métricas: sem tentativas; backtest antigo conta mas sem Sharpe", () => {
    expect(tentativasDo(backtest({ estado: "rodando", metricas: null }), TODAS)).toBeNull();
    const antigo = { ...metricas, sharpe: undefined, observacoes: undefined, barrasPorAno: undefined };
    expect(tentativasDo(backtest({ metricas: antigo }), TODAS)).toMatchObject({
      total: 3,
      sharpeDeflacionado: null,
      probabilidadeSharpe: null,
    });
  });

  it("a lista inteira pede as tentativas uma vez, só das estratégias concluídas", async () => {
    const pedidos: (readonly string[])[] = [];
    const fonte = {
      tentativas: (_u: string, ids: readonly string[]) => {
        pedidos.push(ids);
        return Promise.resolve(TODAS);
      },
    };
    const lista = [backtest(), backtest({ id: "b9", estrategiaId: "e2", estado: "na_fila", metricas: null })];
    const r = await comTentativas(fonte, "u1", lista);
    expect(pedidos).toEqual([["e1"]]);
    expect(r[0]?.tentativas?.total).toBe(3);
    expect(r[1]?.tentativas).toBeNull();
  });
});
