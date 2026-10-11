import type { Intervalo, PortaCandles } from "@zentrade/contratos";
import { describe, expect, it } from "vitest";
import { montarCenario } from "./teste/cenario.js";

function candlesGravados(falhar = false) {
  const gravados: { intervalo: Intervalo; aberturas: number[] }[] = [];
  const porta: PortaCandles = {
    gravar: async (_simbolo, intervalo, lista) => {
      if (falhar) throw new Error("banco fora");
      gravados.push({ intervalo, aberturas: lista.map((c) => c.abertura) });
    },
  };
  return { porta, gravados };
}

describe("robô ao vivo: candles fechados vão para o banco", () => {
  it("grava o histórico inicial, cada candle do intervalo e cada candle de 1 min", async () => {
    const g = candlesGravados();
    const c = montarCenario({ candles: g.porta, candlesHistorico: 5 });
    await c.aoVivo.iniciar();
    const intervalo = await c.fecharIntervalo(100);
    const minuto = await c.fecharMinuto(100);
    await c.aoVivo.parar();
    expect(g.gravados[0]).toMatchObject({ intervalo: "15m" });
    expect(g.gravados[0]?.aberturas).toHaveLength(5);
    expect(g.gravados).toContainEqual({ intervalo: "15m", aberturas: [intervalo.abertura] });
    expect(g.gravados).toContainEqual({ intervalo: "1m", aberturas: [minuto.abertura] });
  });

  it("falha ao gravar não para o robô (vai para o registro)", async () => {
    const g = candlesGravados(true);
    const c = montarCenario({ candles: g.porta });
    await c.aoVivo.iniciar();
    await c.fecharIntervalo(94);
    await c.aoVivo.parar();
    expect(c.ordensEnviadas()).toHaveLength(1);
  });

  it("depois de uma queda, os candles recuperados também são gravados", async () => {
    const g = candlesGravados();
    const c = montarCenario({ candles: g.porta, candlesHistorico: 5 });
    await c.aoVivo.iniciar();
    c.papel.desconectar();
    const perdido = await c.fecharIntervalo(100, true);
    c.papel.reconectar();
    await c.aoVivo.ocioso();
    await c.aoVivo.parar();
    expect(g.gravados.some((x) => x.aberturas.includes(perdido.abertura) && x.aberturas.length > 1)).toBe(
      true,
    );
  });
});
