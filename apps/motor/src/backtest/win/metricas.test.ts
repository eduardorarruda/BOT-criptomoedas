import { dec, type Valor } from "@zentrade/dominio";
import { describe, expect, it } from "vitest";
import { brasilia } from "../../teste/win.js";
import type { OperacaoWin } from "./execucao.js";
import { barrasPorAnoDaSerie, metricasDoWin, metricasGravadasWin } from "./metricas.js";
import type { ResultadoBacktestWin } from "./rodar.js";

const op = (dia: string, sentido: "comprado" | "vendido", resultado: number, contratos = 1): OperacaoWin => {
  const tarifas = dec("0.5").times(contratos);
  const deslizamento = dec(2).times(contratos);
  const r = dec(resultado);
  return {
    abertaEm: brasilia(dia, "10:10"),
    fechadaEm: brasilia(dia, "11:00"),
    resultado: r,
    sentido,
    contratos,
    referenciaEntrada: dec(130_000),
    entrada: dec(130_005),
    referenciaSaida: dec(130_100),
    saida: dec(130_095),
    motivo: "zeragem",
    bruto: r.plus(tarifas).plus(deslizamento),
    tarifas,
    corretagem: dec(0),
    deslizamento,
    dia,
  };
};

function resultado(ops: OperacaoWin[], referenciaFinal: Valor = dec(4990)): ResultadoBacktestWin {
  const liquido = ops.reduce((s, o) => s.plus(o.resultado), dec(0));
  const curva = ops.map((o, i) => ({
    em: o.fechadaEm,
    patrimonio: dec(5000).plus(ops.slice(0, i + 1).reduce((s, x) => s.plus(x.resultado), dec(0))),
  }));
  return {
    curva,
    operacoes: ops,
    referencia: { curva: curva.map((p) => ({ ...p, patrimonio: referenciaFinal })), final: referenciaFinal },
    candles: [],
    resultadoLiquido: liquido,
    patrimonioFinal: dec(5000).plus(liquido),
    maiorQueda: dec(0),
    maiorQuedaPercentual: 0,
    barrasExpostas: 0,
    saidasIntrabar: { stop: 0, alvo: 0, ambiguos: 0 },
    zeragens: ops.length,
    semEspacoNoRisco: 1,
    barradasPelosLimites: 2,
    dias: new Set(ops.map((o) => o.dia)).size,
  };
}

const contexto = {
  simbolo: "WIN-IBOV",
  saldoInicial: dec(5000),
  riscoPorOperacao: dec(50),
  inicio: brasilia("2026-01-01", "00:00"),
  fim: brasilia("2026-04-01", "00:00"),
};

describe("métricas do mini índice", () => {
  it("reais e pontos, contratos, custos, por lado e a referência da sessão", () => {
    const r = resultado([op("2026-01-05", "comprado", 100, 2), op("2026-01-06", "vendido", -40, 1)]);
    const m = metricasDoWin(r, contexto);
    expect(m).toMatchObject({
      simbolo: "WIN-IBOV",
      aproximacao: true,
      contratosNegociados: 3,
      operacoesCompradas: 1,
      operacoesVendidas: 1,
      resultadoComprado: "100",
      resultadoVendido: "-40",
      custosB3: "1.5",
      corretagem: "0",
      deslizamentoPago: "6",
      deslizamentoPontos: "30",
      // líquido 60 ÷ 3 contratos = R$ 20 = 100 pontos por contrato
      resultadoPorContrato: "20",
      pontosPorContrato: "100",
      pontosLiquidos: "300",
      // bruto = 60 + 1,5 + 6 = 67,5 = 337,5 pontos
      pontosBrutos: "337.5",
      zeragens: 2,
      semEspacoNoRisco: 1,
      barradasPelosLimites: 2,
      dias: 2,
      sessao: { resultado: "-10", resultadoPercentual: -0.002 },
    });
    // custos consomem 7,5 de 67,5 do bruto
    expect(m.custosSobreBruto).toBeCloseTo(7.5 / 67.5, 12);
  });

  it("IR estimado por mês com o prejuízo compensado e o líquido depois do IR", () => {
    const r = resultado([
      op("2026-01-05", "comprado", -300),
      op("2026-02-03", "vendido", 500),
      op("2026-03-03", "comprado", 100),
    ]);
    const m = metricasDoWin(r, contexto);
    // jan: −300; fev: 500 − 300 = 200 → R$ 40; mar: 100 → R$ 20
    expect(m.meses.map((x) => [x.mes, x.ir])).toEqual([
      ["2026-01", "0"],
      ["2026-02", "40"],
      ["2026-03", "20"],
    ]);
    expect(m.irEstimado).toBe("60");
    expect(m.irrfInformativo).toBe("6");
    expect(m.liquidoDepoisDoIr).toBe("240");
    expect(m.prejuizoACompensar).toBe("0");
  });

  it("sem operações: zeros, sem custos sobre o bruto", () => {
    const m = metricasDoWin(resultado([], dec(5000)), { ...contexto, simbolo: "WIN" });
    expect(m).toMatchObject({ contratosNegociados: 0, resultadoPorContrato: "0", aproximacao: false });
    expect(m.custosSobreBruto).toBeNull();
  });

  it("nas métricas gravadas, as de sempre (em reais) e o bloco win", () => {
    const r = resultado([op("2026-01-05", "comprado", 100, 2)]);
    const g = metricasGravadasWin(r, contexto);
    expect(g.resultadoLiquido).toBe("100");
    expect(g.taxasPagas).toBe("1");
    expect(g.deslizamentoPago).toBe("4");
    expect(g.resultadoBruto).toBe("105");
    expect(g.ordens).toBe(2);
    expect(g.precisaoMinuto).toBe(false);
    expect(g.win?.contratosNegociados).toBe(2);
  });

  it("candles por ano pela própria série", () => {
    expect(barrasPorAnoDaSerie(24_192, 0, 365 * 86_400_000)).toBe(24_192);
    expect(barrasPorAnoDaSerie(0, 0, 1)).toBe(1);
  });
});
