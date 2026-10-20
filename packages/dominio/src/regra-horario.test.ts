import { describe, expect, it } from "vitest";
import type { ContextoMercado } from "./contexto.js";
import { contextoAte, contextoDeCandles } from "./contexto.js";
import { dec } from "./dinheiro.js";
import type { Candle } from "./tipos.js";
import { avaliar, descreverRegra, validarRegra, type Regra } from "./regras.js";

/** Candle que ABRE às `hh:mm` de Brasília (UTC-3, sem horário de verão) do dia 2026-10-20. */
const abreEm = (hh: number, mm = 0): number => Date.UTC(2026, 9, 20, hh + 3, mm);
const ctxAbrindoEm = (hh: number, mm = 0, fuso?: string): ContextoMercado => ({
  fechamentos: [100, 101],
  instantes: [abreEm(hh, mm) - 300_000, abreEm(hh, mm)],
  ...(fuso ? { fuso } : {}),
});
const janela = (de: string, ate: string): Regra => ({ tipo: "horario", de, ate });

describe("regra de horário", () => {
  it("vale dentro da janela e não vale fora dela", () => {
    expect(avaliar(janela("12:00", "15:00"), ctxAbrindoEm(13, 30)).valor).toBe(true);
    expect(avaliar(janela("12:00", "15:00"), ctxAbrindoEm(11, 55)).valor).toBe(false);
    expect(avaliar(janela("12:00", "15:00"), ctxAbrindoEm(16)).valor).toBe(false);
  });

  it("a borda é [de, ate): o início conta, o fim não", () => {
    expect(avaliar(janela("12:00", "15:00"), ctxAbrindoEm(12, 0)).valor).toBe(true);
    expect(avaliar(janela("12:00", "15:00"), ctxAbrindoEm(14, 59)).valor).toBe(true);
    expect(avaliar(janela("12:00", "15:00"), ctxAbrindoEm(15, 0)).valor).toBe(false);
  });

  it("janela que cruza a meia-noite", () => {
    const noite = janela("22:00", "02:00");
    expect(avaliar(noite, ctxAbrindoEm(22, 0)).valor).toBe(true);
    expect(avaliar(noite, ctxAbrindoEm(23, 59)).valor).toBe(true);
    expect(avaliar(noite, ctxAbrindoEm(0, 0)).valor).toBe(true);
    expect(avaliar(noite, ctxAbrindoEm(1, 59)).valor).toBe(true);
    expect(avaliar(noite, ctxAbrindoEm(2, 0)).valor).toBe(false);
    expect(avaliar(noite, ctxAbrindoEm(12, 0)).valor).toBe(false);
    expect(avaliar(noite, ctxAbrindoEm(21, 59)).valor).toBe(false);
  });

  it("usa o horário de ABERTURA do último candle, não o do anterior nem o do fechamento", () => {
    const ctx: ContextoMercado = { fechamentos: [1, 2], instantes: [abreEm(14, 50), abreEm(14, 55)] };
    expect(avaliar(janela("14:55", "15:00"), ctx).valor).toBe(true);
    expect(avaliar(janela("14:50", "14:55"), ctx).valor).toBe(false);
  });

  it("não olha o futuro: o contexto cortado no candle i dá a resposta do candle i", () => {
    const cheio: ContextoMercado = {
      fechamentos: [1, 2, 3],
      instantes: [abreEm(11, 55), abreEm(12, 0), abreEm(12, 5)],
    };
    const regra = janela("12:00", "12:05");
    expect(avaliar(regra, contextoAte(cheio, 0)).valor).toBe(false);
    expect(avaliar(regra, contextoAte(cheio, 1)).valor).toBe(true);
    expect(avaliar(regra, contextoAte(cheio, 2)).valor).toBe(false);
  });

  it("respeita o fuso do contexto (padrão: Brasília)", () => {
    // 13:30 em Brasília = 16:30 UTC = 12:30 em Nova York (UTC-4 em outubro).
    expect(avaliar(janela("12:00", "13:00"), ctxAbrindoEm(13, 30, "America/New_York")).valor).toBe(true);
    expect(avaliar(janela("12:00", "13:00"), ctxAbrindoEm(13, 30, "UTC")).valor).toBe(false);
    expect(avaliar(janela("16:00", "17:00"), ctxAbrindoEm(13, 30, "UTC")).valor).toBe(true);
    expect(avaliar(janela("13:00", "14:00"), ctxAbrindoEm(13, 30)).valor).toBe(true);
  });

  it("sem os instantes dos candles, diz que faltam dados e não vale", () => {
    const r = avaliar(janela("12:00", "15:00"), { fechamentos: [1, 2] });
    expect(r.valor).toBe(false);
    expect(r.explicacao).toMatch(/dados insuficientes/);
  });

  it("explica com o horário do candle", () => {
    expect(avaliar(janela("12:00", "15:00"), ctxAbrindoEm(13, 5)).explicacao).toBe(
      "horário do candle 13:05 entre 12:00 e 15:00: sim",
    );
    expect(avaliar(janela("12:00", "15:00"), ctxAbrindoEm(9, 0)).explicacao).toBe(
      "horário do candle 09:00 entre 12:00 e 15:00: não",
    );
  });

  it("combina com E, OU e NÃO como as outras regras", () => {
    const sempre: Regra = {
      tipo: "comparar",
      esquerda: { tipo: "preco" },
      comparador: ">",
      direita: { tipo: "numero", valor: 0 },
    };
    const ctx = ctxAbrindoEm(13, 0);
    expect(avaliar({ tipo: "e", regras: [sempre, janela("12:00", "15:00")] }, ctx).valor).toBe(true);
    expect(avaliar({ tipo: "e", regras: [sempre, janela("14:00", "15:00")] }, ctx).valor).toBe(false);
    expect(avaliar({ tipo: "ou", regras: [janela("14:00", "15:00"), sempre] }, ctx).valor).toBe(true);
    expect(avaliar({ tipo: "nao", regra: janela("12:00", "15:00") }, ctx).valor).toBe(false);
  });

  it("o contexto montado de candles (backtest, robô, placar) lê a abertura de cada candle", () => {
    const candle = (abertura: number): Candle => ({
      abertura,
      fechamento: abertura + 299_999,
      abre: dec(1),
      maxima: dec(1),
      minima: dec(1),
      fecha: dec(1),
      volume: dec(1),
    });
    const ctx = contextoDeCandles([candle(abreEm(12, 55)), candle(abreEm(13, 0))]);
    expect(avaliar(janela("13:00", "13:05"), ctx).valor).toBe(true);
    expect(avaliar(janela("13:00", "13:05"), contextoAte(ctx, 0)).valor).toBe(false);
    expect(avaliar(janela("13:00", "13:05"), { ...ctx, fuso: "UTC" }).valor).toBe(false);
  });

  it("a descrição em texto cita o fuso", () => {
    expect(descreverRegra(janela("12:00", "15:00"))).toBe(
      "horário entre 12:00 e 15:00 (horário de Brasília)",
    );
    expect(descreverRegra(janela("12:00", "15:00"), "UTC")).toBe("horário entre 12:00 e 15:00 (UTC)");
    expect(descreverRegra({ tipo: "nao", regra: janela("22:00", "02:00") })).toBe(
      "não (horário entre 22:00 e 02:00 (horário de Brasília))",
    );
  });

  it("validarRegra recusa horário mal formado e janela vazia", () => {
    expect(validarRegra(janela("12:00", "15:00"))).toEqual([]);
    expect(validarRegra(janela("22:00", "02:00"))).toEqual([]);
    expect(validarRegra(janela("9:00", "15:00"))[0]).toMatch(/HH:MM/);
    expect(validarRegra(janela("12:00", "24:00"))[0]).toMatch(/HH:MM/);
    expect(validarRegra(janela("12:00", "12:00"))[0]).toMatch(/diferentes/);
  });
});
