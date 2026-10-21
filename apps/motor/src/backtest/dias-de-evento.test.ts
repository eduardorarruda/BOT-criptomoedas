import { dec, type EventoMercado, type ModoDiasDeEvento } from "@zentrade/dominio";
import { describe, expect, it } from "vitest";
import { serie } from "../teste/candles.js";
import { ESTRATEGIA } from "../teste/cenario.js";
import { rodarBacktest, type EntradaBacktest } from "./rodar.js";

const QUINZE = 15 * 60_000;
const POR_DIA = 96;
/** 00:00 de 01/01/2026 em Brasília: os dias da série coincidem com os dias do fuso padrão. */
const T0 = Date.UTC(2026, 0, 1, 3, 0);

/** Três dias; em cada um, uma queda a 94 (compra) e o alvo logo depois (vende a 96). */
function tresDias(): number[] {
  const dia = Array<number>(POR_DIA).fill(100);
  dia[30] = 94;
  dia[31] = 96;
  return [...dia, ...dia, ...dia];
}

const COPOM: EventoMercado = {
  data: "2026-01-02", // o segundo dia
  mercado: "cripto",
  titulo: "Copom — decisão da Selic",
  impacto: "alto",
};

const rodar = (modo: ModoDiasDeEvento, eventos: readonly EventoMercado[] = [COPOM]) => {
  const e: EntradaBacktest = {
    simbolo: "BTCUSDT",
    intervalo: "15m",
    candles: serie(T0, tresDias(), QUINZE),
    estrategia: ESTRATEGIA,
    limites: {
      perdaDiariaMaxima: dec(50),
      exposicaoMaxima: dec(1000),
      ordensPorHoraMax: 10,
      pausaAposPerdaMs: 0,
      confiancaMinima: 0.5,
      diasDeEvento: modo,
    },
    riscoPorOperacao: dec(10),
    saldoInicial: dec(1000),
    agente: "sempre_concorda",
    aquecimento: 0,
    eventos,
  };
  return rodarBacktest(e);
};

describe("backtest com filtro de dia de evento (cripto)", () => {
  it("ignorar: nada muda, mesmo com evento na agenda, e não conta nada", async () => {
    const r = await rodar("ignorar");
    expect(r.operacoesFechadas).toHaveLength(3);
    expect(r.entradasBarradasPorEvento).toBe(0);
    expect(r.entradasReduzidasPorEvento).toBe(0);
  });

  it("bloquear: não abre no dia do evento, conta o sinal barrado e MANTÉM todas as velas", async () => {
    const base = await rodar("ignorar");
    const r = await rodar("bloquear");
    expect(r.candles).toHaveLength(3 * POR_DIA);
    expect(r.curva).toHaveLength(3 * POR_DIA);
    expect(r.operacoesFechadas).toHaveLength(2);
    expect(r.entradasBarradasPorEvento).toBe(1);
    // os dias sem evento (1 e 3) ficam IDÊNTICOS aos do backtest sem filtro
    expect(r.operacoesFechadas[0]).toEqual(base.operacoesFechadas[0]);
    expect(r.operacoesFechadas[1]).toEqual(base.operacoesFechadas[2]);
  });

  it("reduzir: entra com metade do tamanho no dia do evento; os outros dias idênticos", async () => {
    const base = await rodar("ignorar");
    const r = await rodar("reduzir");
    expect(r.operacoesFechadas).toHaveLength(3);
    expect(r.entradasReduzidasPorEvento).toBe(1);
    expect(r.operacoesFechadas[0]).toEqual(base.operacoesFechadas[0]);
    expect(r.operacoesFechadas[2]).toEqual(base.operacoesFechadas[2]);
    const cheio = base.operacoesFechadas[1]!.resultado.toNumber();
    const metade = r.operacoesFechadas[1]!.resultado.toNumber();
    expect(metade / cheio).toBeGreaterThan(0.45);
    expect(metade / cheio).toBeLessThan(0.55);
  });

  it("evento de outro mercado ou de impacto médio não filtra", async () => {
    const outros = [
      { ...COPOM, mercado: "win" as const },
      { ...COPOM, impacto: "medio" as const },
    ];
    const r = await rodar("bloquear", outros);
    expect(r.operacoesFechadas).toHaveLength(3);
    expect(r.entradasBarradasPorEvento).toBe(0);
  });
});
