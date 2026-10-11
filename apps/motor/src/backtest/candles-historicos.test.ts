import type { Intervalo } from "@zentrade/contratos";
import { PapelCorretora } from "@zentrade/corretora";
import { dec, paraTexto, type Candle } from "@zentrade/dominio";
import { describe, expect, it } from "vitest";
import { serie } from "../teste/candles.js";
import { candlesHistoricos, type CandlesDoBanco } from "./candles-historicos.js";

const H = 3_600_000;
const INICIO = Date.UTC(2026, 0, 10);

/** Banco de candles em memória, com o mesmo limite de 1000 por consulta do repositório real. */
function bancoFalso(iniciais: readonly Candle[] = []) {
  let guardados = [...iniciais];
  const gravacoes: number[] = [];
  const banco: CandlesDoBanco = {
    candles: async (c) =>
      guardados
        .filter((k) => k.abertura >= c.inicio && k.abertura < c.fim)
        .slice(0, 1000)
        .map((k) => ({
          abertura: k.abertura,
          abre: paraTexto(k.abre),
          maxima: paraTexto(k.maxima),
          minima: paraTexto(k.minima),
          fecha: paraTexto(k.fecha),
          volume: paraTexto(k.volume),
        })),
    gravar: async (_s: string, _i: Intervalo, lista: readonly Candle[]) => {
      gravacoes.push(lista.length);
      const novos = new Map(guardados.map((k) => [k.abertura, k]));
      lista.forEach((k) => novos.set(k.abertura, k));
      guardados = [...novos.values()].sort((a, b) => a.abertura - b.abertura);
    },
  };
  return { banco, gravacoes, total: () => guardados.length };
}

function corretoraCom(candles: readonly Candle[]) {
  const papel = new PapelCorretora({ saldos: {}, taxa: 0, deslizamentoBps: 0 });
  candles.forEach((c) => papel.alimentar("BTCUSDT", "1h", c));
  let chamadas = 0;
  return {
    corretora: {
      candles: (...a: Parameters<PapelCorretora["candles"]>) => {
        chamadas++;
        return papel.candles(...a);
      },
    },
    chamadas: () => chamadas,
  };
}

const precos = (n: number) => Array.from({ length: n }, (_, i) => 100 + (i % 10));
const consulta = { simbolo: "BTCUSDT", intervalo: "1h" as const, inicio: INICIO, fim: INICIO + 1500 * H };

describe("candles históricos do backtest", () => {
  it("baixa da corretora (paginando de trás para frente), grava no banco e devolve em ordem", async () => {
    const todos = serie(INICIO - 300 * H, precos(1800 + 300), H);
    const b = bancoFalso();
    const c = corretoraCom(todos);
    const lista = await candlesHistoricos({ banco: b.banco, corretora: c.corretora }, consulta, 200);
    expect(lista[0]?.abertura).toBe(INICIO - 200 * H);
    expect(lista.at(-1)?.abertura).toBe(INICIO + 1499 * H);
    expect(lista).toHaveLength(1700);
    expect(lista.every((k, i) => i === 0 || k.abertura > lista[i - 1]!.abertura)).toBe(true);
    expect(c.chamadas()).toBeGreaterThan(1);
    expect(b.total()).toBe(1700);
    expect(lista[5]?.fechamento).toBe(lista[5]!.abertura + H - 1);
  });

  it("com o período inteiro no banco, não chama a corretora", async () => {
    const todos = serie(INICIO - 200 * H, precos(1700), H);
    const b = bancoFalso(todos);
    const c = corretoraCom([]);
    const lista = await candlesHistoricos({ banco: b.banco, corretora: c.corretora }, consulta, 200);
    expect(lista).toHaveLength(1700);
    expect(lista[0]?.fecha.equals(dec(100))).toBe(true);
    expect(c.chamadas()).toBe(0);
    expect(b.gravacoes).toEqual([]);
  });

  it("sem banco (papel em memória), só a corretora", async () => {
    const c = corretoraCom(serie(INICIO, precos(10), H));
    const lista = await candlesHistoricos(
      { corretora: c.corretora },
      { ...consulta, fim: INICIO + 10 * H },
      0,
    );
    expect(lista).toHaveLength(10);
  });

  it("período longo demais é recusado com explicação", async () => {
    const c = corretoraCom([]);
    await expect(
      candlesHistoricos(
        { corretora: c.corretora },
        { ...consulta, intervalo: "1m", fim: INICIO + 400 * 86_400_000 },
        0,
      ),
    ).rejects.toThrow(/longo demais/);
  });
});
