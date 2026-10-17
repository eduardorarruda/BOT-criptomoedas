import { criarBancoDoMotor, type BancoDoMotor } from "@zentrade/banco";
import { criarBancoDescartavel, type BancoDescartavel } from "@zentrade/banco/teste";
import { dec } from "@zentrade/dominio";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { candlesHistoricos } from "../backtest/candles-historicos.js";
import { executarImportacaoCsv } from "../dados-b3/comandos.js";
import { gravarCandlesB3 } from "../dados-b3/importar.js";
import { aberturaSemente, sementeWinIbov5m } from "../teste/win-ibov.js";

const M5 = 300_000;
const AGORA = Date.UTC(2026, 9, 17);
const MT5 = new URL("../teste/fixtures/win-mt5-5m.csv", import.meta.url);

/** Nada de Binance para símbolo da B3: qualquer chamada derruba o teste. */
const semBinance = {
  candles: () => Promise.reject(new Error("não deveria ir à Binance para um símbolo da B3")),
};

interface Linha {
  intervalo: string;
  abertura: number;
  fechamento: number;
  abre: string;
  maxima: string;
  minima: string;
  fecha: string;
  volume: string;
}

describe("candles da B3 no PostgreSQL (TimescaleDB)", () => {
  let descartavel: BancoDescartavel;
  let banco: BancoDoMotor;
  let sql: BancoDoMotor["conexao"]["sql"];

  const linhas = (simbolo: string) =>
    sql<Linha[]>`
      select intervalo, (extract(epoch from abertura) * 1000)::float8 as abertura,
             (extract(epoch from fechamento) * 1000)::float8 as fechamento, abre::text, maxima::text, minima::text, fecha::text, volume::text
      from candles where simbolo = ${simbolo} order by intervalo, abertura`;
  const contagem = async (simbolo: string) =>
    Object.fromEntries(
      (
        await sql<{ intervalo: string; n: number }[]>`
          select intervalo, count(*)::int as n from candles where simbolo = ${simbolo} group by intervalo`
      ).map((l) => [l.intervalo, l.n]),
    );

  beforeAll(async () => {
    descartavel = await criarBancoDescartavel();
    banco = criarBancoDoMotor({ url: descartavel.url, maximoConexoes: 2 });
    sql = banco.conexao.sql;
  });
  afterAll(async () => {
    await banco.fechar();
    await descartavel.descartar();
  });
  beforeEach(async () => {
    await sql`delete from candles`;
  });

  it("upsert idempotente: importar duas vezes deixa as mesmas linhas, com 15m e 1h", async () => {
    const r = await gravarCandlesB3(banco.mercado, "WIN-IBOV", "5m", sementeWinIbov5m(), { agora: AGORA });
    expect(r.gravados).toEqual({ "5m": 252, "15m": 84, "1h": 21 });
    const antes = await linhas("WIN-IBOV");
    await gravarCandlesB3(banco.mercado, "WIN-IBOV", "5m", sementeWinIbov5m(), { agora: AGORA });
    expect(await linhas("WIN-IBOV")).toEqual(antes);
    expect(await contagem("WIN-IBOV")).toEqual({ "5m": 252, "15m": 84, "1h": 21 });
    const primeira = antes.find((l) => l.intervalo === "5m");
    expect(primeira?.abertura).toBe(aberturaSemente(0, 0));
    expect(primeira?.fechamento).toBe(aberturaSemente(0, 0) + M5 - 1);
  });

  it("corrige um candle e a hora dele, mesmo com o chunk já comprimido", async () => {
    await gravarCandlesB3(banco.mercado, "WIN-IBOV", "5m", sementeWinIbov5m(), { agora: AGORA });
    // Julho de 2026 já passou dos 30 dias da política de compressão: comprime à força.
    await sql`select compress_chunk(c, if_not_compressed => true) from show_chunks('candles') c`;
    const [comprimidos] = await sql<{ n: number }[]>`
      select count(*)::int as n from timescaledb_information.chunks
      where hypertable_name = 'candles' and is_compressed`;
    expect(comprimidos?.n).toBeGreaterThan(0);
    const [k] = sementeWinIbov5m();
    const corrigido = { ...k!, minima: dec("100000"), volume: dec("7") };
    await gravarCandlesB3(banco.mercado, "WIN-IBOV", "5m", [corrigido], { agora: AGORA });
    const [lido] = await banco.mercado.candles({
      simbolo: "WIN-IBOV",
      intervalo: "5m",
      inicio: k!.abertura,
      fim: k!.abertura + M5,
    });
    expect(lido).toMatchObject({ minima: "100000", volume: "7" });
    const [hora] = await banco.mercado.candles({
      simbolo: "WIN-IBOV",
      intervalo: "1h",
      inicio: k!.abertura,
      fim: k!.abertura + 12 * M5,
    });
    expect(hora?.minima).toBe("100000");
    expect(await contagem("WIN-IBOV")).toEqual({ "5m": 252, "15m": 84, "1h": 21 });
  });

  it("o backtest lê WIN-IBOV do banco, com aquecimento dos pregões anteriores, sem Binance", async () => {
    await gravarCandlesB3(banco.mercado, "WIN-IBOV", "5m", sementeWinIbov5m(), { agora: AGORA });
    const pedido = {
      simbolo: "WIN-IBOV",
      intervalo: "15m" as const,
      inicio: aberturaSemente(2, 0),
      fim: aberturaSemente(2, 0) + 28 * 3 * M5,
    };
    const lista = await candlesHistoricos({ banco: banco.mercado, corretora: semBinance }, pedido, 40);
    expect(lista.filter((k) => k.abertura >= pedido.inicio)).toHaveLength(28);
    expect(lista.filter((k) => k.abertura < pedido.inicio)).toHaveLength(56);
    expect(lista[0]?.fechamento).toBe(aberturaSemente(0, 0) + 3 * M5 - 1);
  });

  it("CSV do MetaTrader 5 → banco → backtest, para WIN", async () => {
    const saida: string[] = [];
    const r = await executarImportacaoCsv(
      ["--simbolo", "WIN", "--intervalo", "5m", "--arquivo", MT5.pathname],
      {
        banco: banco.mercado,
        agora: () => AGORA,
        escrever: (l) => saida.push(l),
        lerArquivo: (c) => readFile(c),
        base: "/",
      },
    );
    expect(r.gravados).toEqual({ "5m": 5, "15m": 2, "1h": 1 });
    expect(await contagem("WIN")).toEqual({ "5m": 5, "15m": 2, "1h": 1 });
    const lista = await candlesHistoricos(
      { banco: banco.mercado, corretora: semBinance },
      { simbolo: "WIN", intervalo: "5m", inicio: Date.UTC(2026, 6, 1), fim: Date.UTC(2026, 6, 2) },
      0,
    );
    expect(lista.map((k) => k.fecha.toString())).toEqual([
      "128050",
      "128120",
      "128180",
      "128250",
      "128280.5",
    ]);
    // O símbolo da B3 não aparece nos agregados contínuos de 1m (que são só da Binance).
    const [agregado] = await sql<{ n: number }[]>`
      select count(*)::int as n from candles_5m where simbolo = 'WIN'`;
    expect(agregado?.n).toBe(0);
  });
});
