import { dec, MODELOS, type Candle } from "@zentrade/dominio";
import { describe, expect, it } from "vitest";
import { rodarBacktest } from "./rodar.js";

/**
 * O cofre de tendência no backtest do sistema contra a conta pura do estudo
 * (pesquisa/queda/cofre-tendencia.mjs), em dados sintéticos e determinísticos. Com dados reais
 * (BTC e ETH, 2019→2026) a comparação está em pesquisa/queda/COFRE-SISTEMA.md, rodada por
 * pesquisa/queda/cofre-sistema.mjs.
 *
 * As diferenças esperadas são só duas, e ambas deliberadas: o sistema investe 99,5% do saldo
 * (a folga para deslizamento e spread, FOLGA_DA_ALOCACAO) e tem o alvo de +99% como proteção.
 */
const H4 = 14_400_000;
const CUSTO = 0.001 + 0.0007;
const INVESTIDO = 0.995;

/** Gerador congruencial: o mesmo ruído em toda execução. */
function sorteio(semente: number): () => number {
  let x = semente;
  return () => {
    x = (x * 1_664_525 + 1_013_904_223) % 4_294_967_296;
    return x / 4_294_967_296;
  };
}

/** Passeio com regimes de alta e queda, para a SMA 400 cruzar o preço várias vezes sem dobrar o preço numa posição. */
function velas(n: number): Candle[] {
  const r = sorteio(7);
  let fecha = 100;
  const inicio = Date.UTC(2024, 0, 1, 0, 0, 0);
  return Array.from({ length: n }, (_, i) => {
    const regime = Math.sin(i / 70) * 0.0014;
    const abre = fecha;
    fecha = Math.max(1, abre * (1 + regime + (r() - 0.5) * 0.02));
    const abertura = inicio + i * H4;
    return {
      abertura,
      fechamento: abertura + H4 - 1,
      abre: dec(abre.toFixed(4)),
      maxima: dec((Math.max(abre, fecha) * 1.002).toFixed(4)),
      minima: dec((Math.min(abre, fecha) * 0.998).toFixed(4)),
      fecha: dec(fecha.toFixed(4)),
      volume: dec(10),
    };
  });
}

/** A conta de cofre-tendencia.mjs (uma decisão por dia, vela das 20:00 UTC), com `investido` do capital. */
function estudo(v: readonly Candle[], investido: number) {
  const f = v.map((c) => ({ t: c.abertura, o: c.abre.toNumber(), c: c.fecha.toNumber() }));
  const sma = (i: number) => f.slice(i - 399, i + 1).reduce((s, x) => s + x.c, 0) / 400;
  let cap = 1;
  let dentro = false;
  let sinal: boolean | null = null;
  let trocas = 0;
  let pico = 0;
  let queda = 0;
  for (let i = 400; i < f.length; i++) {
    const x = f[i]!;
    if (sinal !== null && sinal !== dentro) {
      cap *= 1 - investido * CUSTO;
      dentro = sinal;
      trocas++;
    }
    sinal = null;
    if (dentro) cap *= 1 + investido * (x.c / (i === 400 ? x.o : f[i - 1]!.c) - 1);
    pico = Math.max(pico, cap);
    queda = Math.min(queda, cap / pico - 1);
    if (new Date(x.t).getUTCHours() === 20) sinal = x.c > sma(i);
  }
  return { retorno: cap - 1, queda, trocas };
}

describe("cofre de tendência: sistema contra a conta do estudo (dados sintéticos)", () => {
  it("entra e sai nos mesmos dias e chega perto no retorno e na pior queda", async () => {
    const v = velas(4000);
    const modelo = MODELOS.find((m) => m.id === "cofre-tendencia-sma400")!;
    const r = await rodarBacktest({
      simbolo: "BTCUSDT",
      intervalo: "4h",
      candles: v,
      estrategia: modelo.estrategia,
      limites: {
        perdaDiariaMaxima: dec(1e12),
        exposicaoMaxima: dec(1e12),
        ordensPorHoraMax: 1000,
        pausaAposPerdaMs: 0,
        confiancaMinima: 0,
      },
      riscoPorOperacao: dec(1),
      saldoInicial: dec(10_000),
      agente: "sempre_concorda",
      custos: { taxaPorLado: 0.001, deslizamentoBps: 5, meioSpreadBps: 2 },
      execucao: "proximaAbertura",
      inicio: v[400]!.abertura,
      aquecimento: 400,
    });
    const e = estudo(v, INVESTIDO);

    // Precondição: nada do que o estudo não tem (stop de 49% ou alvo de +99%) agiu neste cenário.
    expect(r.saidasIntrabar).toEqual({ stop: 0, alvo: 0, ambiguos: 0 });
    expect(e.trocas).toBeGreaterThanOrEqual(6);

    // As mesmas trocas: cada compra e cada venda do estudo é uma ordem do sistema (a última compra fica aberta).
    expect(r.operacoesFechadas.length).toBe(Math.floor(e.trocas / 2));
    const retornoSistema = r.patrimonioFinal.div(10_000).toNumber() - 1;
    expect(retornoSistema).toBeCloseTo(e.retorno, 1);
    expect(Math.abs(retornoSistema - e.retorno)).toBeLessThan(0.01 + Math.abs(e.retorno) * 0.02);
    expect(Math.abs(-r.maiorQuedaPercentual - e.queda)).toBeLessThan(0.01);
  }, 120_000);
});
