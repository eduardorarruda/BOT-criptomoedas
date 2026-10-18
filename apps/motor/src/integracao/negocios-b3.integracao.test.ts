import { criarBancoDoMotor, type BancoDoMotor } from "@zentrade/banco";
import { criarBancoDescartavel, type BancoDescartavel } from "@zentrade/banco/teste";
import { dec } from "@zentrade/dominio";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { candlesHistoricos } from "../backtest/candles-historicos.js";
import { conferirArquivoNegocios, blocosDoArquivo } from "../dados-b3/arquivo-negocios.js";
import { executarImportacaoNegocios } from "../dados-b3/comando-negocios.js";

const FIXTURES = fileURLToPath(new URL("../teste/fixtures/", import.meta.url));
const AGORA = Date.UTC(2026, 9, 17, 12);
const ARQUIVOS = ["--arquivos", "negocios-drv-2026-10-13.txt", "negocios-drv-2026-10-14.zip"];
const b3 = (dia: number, h: number, m: number) => Date.UTC(2026, 9, dia, h + 3, m);

const vela5m = (abertura: number) => ({
  abertura,
  fechamento: abertura + 300_000 - 1,
  abre: dec(200_000),
  maxima: dec(200_000),
  minima: dec(200_000),
  fecha: dec(200_000),
  volume: dec(1),
});

const semBinance = {
  candles: () => Promise.reject(new Error("não deveria ir à Binance para um símbolo da B3")),
};

describe("arquivo de negócios da B3 → candles do WIN no PostgreSQL (TimescaleDB)", () => {
  let descartavel: BancoDescartavel;
  let banco: BancoDoMotor;
  let sql: BancoDoMotor["conexao"]["sql"];
  const saida: string[] = [];

  const importar = (extra: string[] = []) =>
    executarImportacaoNegocios([...ARQUIVOS, ...extra], {
      banco: banco.mercado,
      agora: () => AGORA,
      escrever: (l) => saida.push(l),
      base: FIXTURES,
      blocos: blocosDoArquivo,
      conferir: conferirArquivoNegocios,
    });

  const tudo = () =>
    sql<{ intervalo: string; abertura: number; abre: string; fecha: string; volume: string }[]>`
      select intervalo, (extract(epoch from abertura) * 1000)::float8 as abertura, abre::text, fecha::text, volume::text
      from candles where simbolo = 'WIN' order by intervalo, abertura`;
  const contagem = async () =>
    Object.fromEntries(
      (
        await sql<{ intervalo: string; n: number }[]>`
          select intervalo, count(*)::int as n from candles where simbolo = 'WIN' group by intervalo`
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

  it("grava 5m, 15m e 1h dos dois pregões, e reimportar não muda nada", async () => {
    const r = await importar();
    expect(r.dias.map((d) => [d.data, d.contrato])).toEqual([
      ["2026-10-13", "WINV26"],
      ["2026-10-14", "WINZ26"],
    ]);
    expect(await contagem()).toEqual({ "5m": 7, "15m": 6, "1h": 4 });
    const antes = await tudo();
    await importar();
    expect(await tudo()).toEqual(antes);
  });

  it("troca o pregão inteiro, mesmo com o trecho comprimido, e não mexe nos outros dias", async () => {
    await importar();
    const [modelo] = await banco.mercado.candles({
      simbolo: "WIN",
      intervalo: "5m",
      inicio: b3(13, 9, 0),
      fim: b3(13, 9, 5),
    });
    const vela = (abertura: number) => ({
      abertura,
      fechamento: abertura + 300_000 - 1,
      abre: dec(modelo!.abre),
      maxima: dec(modelo!.maxima),
      minima: dec(modelo!.minima),
      fecha: dec(modelo!.fecha),
      volume: dec(1),
    });
    await banco.mercado.gravar("WIN", "5m", [vela(b3(13, 12, 0)), vela(b3(9, 12, 0))]);
    await sql`select compress_chunk(c, if_not_compressed => true) from show_chunks('candles') c`;
    await importar();
    expect(await contagem()).toEqual({ "5m": 8, "15m": 6, "1h": 4 });
    const aberturas = (await tudo()).filter((l) => l.intervalo === "5m").map((l) => l.abertura);
    expect(aberturas).toContain(b3(9, 12, 0));
    expect(aberturas).not.toContain(b3(13, 12, 0));
  });

  it("a troca do pregão é uma transação: falha no meio não apaga nada", async () => {
    await importar();
    const antes = await tudo();
    const inicio = b3(13, 0, 0); // 00:00 de Brasília
    const quebrado = { ...vela5m(b3(13, 9, 0)), abertura: Number.NaN };
    await expect(
      banco.mercado.substituir("WIN", { inicio, fim: inicio + 86_400_000 }, [
        { intervalo: "5m", lista: [] },
        { intervalo: "15m", lista: [quebrado] },
      ]),
    ).rejects.toThrow();
    expect(await tudo()).toEqual(antes);
  });

  it("--ajuste diferenca grava o dia antes da rolagem deslocado", async () => {
    await importar(["--ajuste", "diferenca"]);
    const [primeira] = await banco.mercado.candles({
      simbolo: "WIN",
      intervalo: "5m",
      inicio: b3(13, 9, 0),
      fim: b3(13, 9, 5),
    });
    expect(primeira).toMatchObject({ abre: "201900", volume: "38" });
  });

  it("o backtest lê o WIN importado do banco, sem Binance", async () => {
    await importar();
    const lista = await candlesHistoricos(
      { banco: banco.mercado, corretora: semBinance },
      { simbolo: "WIN", intervalo: "15m", inicio: b3(14, 9, 0), fim: b3(14, 10, 15) },
      2,
    );
    expect(lista.map((k) => k.fecha.toString())).toEqual([
      "200150",
      "200500",
      "202500",
      "202600",
      "202550",
      "202700",
    ]);
  });
});
