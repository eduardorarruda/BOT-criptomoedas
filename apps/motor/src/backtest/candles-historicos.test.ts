import type { Intervalo } from "@zentrade/contratos";
import { PapelCorretora } from "@zentrade/corretora";
import { dec, paraTexto, type Candle } from "@zentrade/dominio";
import { describe, expect, it } from "vitest";
import { bancoDeCandlesFalso } from "../teste/banco-candles.js";
import { serie } from "../teste/candles.js";
import { aberturaSemente, sementeWinIbov5m } from "../teste/win-ibov.js";
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

  describe("símbolos da B3 (WIN-IBOV e WIN): só do banco, nunca da Binance", () => {
    const M5 = 300_000;
    const binance = () => {
      let chamadas = 0;
      return {
        corretora: {
          candles: async () => {
            chamadas++;
            throw new Error("não deveria ir à Binance para um símbolo da B3");
          },
        },
        chamadas: () => chamadas,
      };
    };
    const terceiroPregao = {
      simbolo: "WIN-IBOV",
      intervalo: "5m" as const,
      inicio: aberturaSemente(2, 0),
      fim: aberturaSemente(2, 83) + M5,
    };

    it("lê do banco, com aquecimento contado em pregões e não em horas corridas", async () => {
      const b = bancoDeCandlesFalso();
      await b.banco.gravar("WIN-IBOV", "5m", sementeWinIbov5m());
      const bn = binance();
      const lista = await candlesHistoricos({ banco: b.banco, corretora: bn.corretora }, terceiroPregao, 100);
      expect(bn.chamadas()).toBe(0);
      const antes = lista.filter((k) => k.abertura < terceiroPregao.inicio);
      // 100 candles de 5m são 8 h corridas, mas o pregão anterior acabou 17 h antes.
      expect(antes.length).toBeGreaterThanOrEqual(100);
      expect(lista.filter((k) => k.abertura >= terceiroPregao.inicio)).toHaveLength(84);
      expect(lista.every((k, i) => i === 0 || k.abertura > lista[i - 1]!.abertura)).toBe(true);
      expect(b.gravacoes).toHaveLength(1);
    });

    it("WIN também; sem candles no banco, falha explicando como importar (e não baixa da Binance)", async () => {
      const b = bancoDeCandlesFalso();
      const bn = binance();
      await expect(
        candlesHistoricos(
          { banco: b.banco, corretora: bn.corretora },
          { ...terceiroPregao, simbolo: "WIN" },
          0,
        ),
      ).rejects.toThrow(/importar-candles-csv/);
      expect(bn.chamadas()).toBe(0);
    });

    it("só o aquecimento no banco, sem a janela: também falha (não é backtest)", async () => {
      const b = bancoDeCandlesFalso();
      await b.banco.gravar("WIN-IBOV", "5m", sementeWinIbov5m().slice(0, 168));
      await expect(
        candlesHistoricos({ banco: b.banco, corretora: binance().corretora }, terceiroPregao, 100),
      ).rejects.toThrow(/importar-candles-b3/);
    });

    it("sem banco, recusa em vez de ir à Binance", async () => {
      const bn = binance();
      await expect(candlesHistoricos({ corretora: bn.corretora }, terceiroPregao, 0)).rejects.toThrow(
        /só vêm do banco/,
      );
      expect(bn.chamadas()).toBe(0);
    });

    it("1m (precisão de minuto, opcional) sem dados volta vazio, sem erro e sem Binance", async () => {
      const b = bancoDeCandlesFalso();
      const bn = binance();
      const lista = await candlesHistoricos(
        { banco: b.banco, corretora: bn.corretora },
        { ...terceiroPregao, intervalo: "1m" },
        0,
      );
      expect(lista).toEqual([]);
      expect(bn.chamadas()).toBe(0);
    });
  });
});
