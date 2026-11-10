import { describe, expect, it } from "vitest";
import { HistoricoSinalEsquema, OperacaoPedidoEsquema, VelasPedidoEsquema } from "./pedido-analise.js";

const cripto = {
  sentido: "comprado",
  custos: { mercado: "cripto", taxaPorLado: 0.001, deslizamentoBps: 5, meioSpreadBps: 2 },
  stopPercentual: 0.1,
  stopAtr: { periodo: 20, multiplo: 2 },
  alvoLiquido: 0.6,
  regraSaida: "preço < fundo de Donchian(10)",
};

describe("operação no pedido de análise", () => {
  it("aceita a operação de cripto com custos por lado e deslizamento", () => {
    expect(OperacaoPedidoEsquema.safeParse(cripto).success).toBe(true);
  });

  it("aceita o WIN com tarifa por contrato em reais e ticks de deslizamento", () => {
    const win = {
      ...cripto,
      sentido: "vendido",
      custos: { mercado: "win", tarifaPorContrato: "0.25", corretagemPorContrato: "0", deslizamentoTicks: 1 },
      stopMovel: { tipo: "atr", periodo: 14, multiplo: 3 },
      empate: { gatilho: 0.002 },
      tempoMaximo: 24,
    };
    expect(OperacaoPedidoEsquema.safeParse(win).success).toBe(true);
  });

  it("recusa taxa absurda e deslizamento negativo", () => {
    const r1 = { ...cripto, custos: { ...cripto.custos, taxaPorLado: 0.5 } };
    const r2 = { ...cripto, custos: { ...cripto.custos, deslizamentoBps: -1 } };
    expect(OperacaoPedidoEsquema.safeParse(r1).success).toBe(false);
    expect(OperacaoPedidoEsquema.safeParse(r2).success).toBe(false);
  });
});

describe("velas no pedido de análise", () => {
  it("as séries precisam ter o mesmo tamanho", () => {
    const ok = { instantes: [1, 2], maximas: [10, 11], minimas: [9, 10], volumes: [5, 6] };
    expect(VelasPedidoEsquema.safeParse(ok).success).toBe(true);
    expect(VelasPedidoEsquema.safeParse({ ...ok, volumes: [5] }).success).toBe(false);
  });
});

describe("histórico da mesma regra no pedido de análise", () => {
  const placar = { operacoes: 120, certas: 48, resultadoMedio: 0.08 };
  const historico = {
    fonte: "WIN 15m, mesma regra, 2024-10-28 a 2026-10-27",
    total: placar,
    mesmoHorario: { operacoes: 31, certas: 9, resultadoMedio: -0.05 },
    mesmoLado: { operacoes: 70, certas: 30, resultadoMedio: 0.11 },
    simulacao: {
      replays: 10_000,
      alvoPrimeiro: 0.29,
      stopPrimeiro: 0.26,
      nenhum: 0.45,
      resultadoMedio: 0.02,
    },
  };

  it("aceita o placar total, os recortes e a simulação", () => {
    expect(HistoricoSinalEsquema.safeParse(historico).success).toBe(true);
  });

  it("aceita só o placar total (recortes e simulação são opcionais)", () => {
    expect(HistoricoSinalEsquema.safeParse({ fonte: "x", total: placar }).success).toBe(true);
  });

  it("recusa mais certas do que operações", () => {
    const r = { ...historico, total: { operacoes: 3, certas: 4, resultadoMedio: 0 } };
    expect(HistoricoSinalEsquema.safeParse(r).success).toBe(false);
  });

  it("recusa simulação cujas frações não somam 1", () => {
    const r = { ...historico, simulacao: { ...historico.simulacao, nenhum: 0.9 } };
    expect(HistoricoSinalEsquema.safeParse(r).success).toBe(false);
  });
});
