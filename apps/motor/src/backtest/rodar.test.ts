import { dec, type Estrategia } from "@zentrade/dominio";
import { describe, expect, it } from "vitest";
import { serie } from "../teste/candles.js";
import { ESTRATEGIA } from "../teste/cenario.js";
import { maiorQueda } from "./metricas.js";
import { rodarBacktest, type EntradaBacktest } from "./rodar.js";

const QUINZE = 15 * 60_000;
const T0 = Date.UTC(2026, 0, 1);

const entrada = (precos: (number | string)[], extra: Partial<EntradaBacktest> = {}): EntradaBacktest => ({
  simbolo: "BTCUSDT",
  intervalo: "15m",
  candles: serie(T0, precos, QUINZE),
  estrategia: ESTRATEGIA,
  limites: {
    perdaDiariaMaxima: dec(50),
    exposicaoMaxima: dec(1000),
    ordensPorHoraMax: 10,
    pausaAposPerdaMs: 0,
    confiancaMinima: 0.5,
  },
  riscoPorOperacao: dec(10),
  saldoInicial: dec(1000),
  agente: "sempre_concorda",
  ...extra,
});

const plano = Array<number>(20).fill(100);

describe("backtest", () => {
  it("operação vencedora: compra na queda, vende no alvo, resultado líquido de taxas", async () => {
    const r = await rodarBacktest(entrada([...plano, 94, 94.5, 96, 96]));
    expect(r.operacoes).toBe(1);
    expect(r.acertos).toBe(1);
    expect(r.taxaAcerto).toBe(1);
    expect(r.ordens).toBe(2);
    expect(r.resultadoLiquido.gt(0)).toBe(true);
    expect(r.taxasPagas.gt(0)).toBe(true);
    expect(r.patrimonioFinal.equals(dec(1000).plus(r.resultadoLiquido))).toBe(true);
    expect(r.curva).toHaveLength(24);
    expect(r.curva[0]!.patrimonio.equals(dec(1000))).toBe(true);
  });

  it("operação perdedora no stop: maior queda e taxa de acerto zero", async () => {
    const r = await rodarBacktest(entrada([...plano, 94, 92, 92]));
    expect(r.operacoes).toBe(1);
    expect(r.acertos).toBe(0);
    expect(r.taxaAcerto).toBe(0);
    expect(r.resultadoLiquido.lt(0)).toBe(true);
    expect(r.maiorQueda.gt(0)).toBe(true);
    expect(r.maiorQuedaPercentual).toBeGreaterThan(0);
  });

  it("agente que nunca concorda: nenhuma operação, patrimônio parado", async () => {
    const r = await rodarBacktest(entrada([...plano, 94, 96], { agente: "nunca_concorda" }));
    expect(r.operacoes).toBe(0);
    expect(r.ordens).toBe(0);
    expect(r.taxaAcerto).toBe(0);
    expect(r.resultadoLiquido.isZero()).toBe(true);
    expect(r.maiorQueda.isZero()).toBe(true);
  });

  it("janela com aquecimento: indicadores usam os candles antes do início", async () => {
    const porMedia: Estrategia = {
      ...ESTRATEGIA,
      entrada: {
        tipo: "comparar",
        esquerda: { tipo: "preco" },
        comparador: "<",
        direita: {
          tipo: "multiplicar",
          operando: { tipo: "indicador", nome: "sma", periodo: 20 },
          fator: 0.97,
        },
      },
    };
    const precos = [...plano, 94, 96, 96];
    const inicio = T0 + 20 * QUINZE;
    const com = await rodarBacktest(entrada(precos, { estrategia: porMedia, inicio }));
    expect(com.operacoes).toBe(1);
    expect(com.curva[0]!.em).toBe(inicio + QUINZE - 1);
    const sem = await rodarBacktest(entrada(precos, { estrategia: porMedia, inicio, aquecimento: 0 }));
    expect(sem.operacoes).toBe(0);
    const ate = await rodarBacktest(entrada(precos, { estrategia: porMedia, inicio, fim: inicio + QUINZE }));
    expect(ate.curva).toHaveLength(1);
  });

  it("é determinístico: mesma entrada, mesmo resultado", async () => {
    const e = entrada([...plano, 94, 92, 93, 94, 96, 90, 94, 97], { deslizamentoBps: 5 });
    expect(await rodarBacktest(e)).toEqual(await rodarBacktest(e));
  });

  it("recusa estratégia inválida e janela vazia com explicação", async () => {
    await expect(rodarBacktest(entrada(plano, { estrategia: { ...ESTRATEGIA, stop: 0.9 } }))).rejects.toThrow(
      /stop/,
    );
    await expect(rodarBacktest(entrada(plano, { inicio: T0 + 100 * QUINZE }))).rejects.toThrow(
      /nenhum candle/,
    );
  });
});

describe("maior queda", () => {
  it("maior distância de um pico até um vale posterior", () => {
    const curva = [100, 120, 90, 130, 117, 140].map((p, em) => ({ em, patrimonio: dec(p) }));
    const q = maiorQueda(curva);
    expect(q.valor.equals(dec(30))).toBe(true);
    expect(q.percentual).toBeCloseTo(0.25, 10);
    expect(maiorQueda([]).valor.isZero()).toBe(true);
  });
});
