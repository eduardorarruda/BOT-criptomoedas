import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { lerCsvCandles } from "./csv.js";
import { FUSO_B3, lerFuso } from "./fuso.js";

/** Exportação de barras do MetaTrader 5, inventada, com linhas estranhas de propósito. */
const MT5 = new URL("../teste/fixtures/win-mt5-5m.csv", import.meta.url);
const SP = lerFuso(FUSO_B3);
/** Hora de Brasília (UTC−3) em 1º de julho de 2026, em ms UTC. */
const brt = (hora: number, minuto = 0, dia = 1) => Date.UTC(2026, 6, dia, hora + 3, minuto);

describe("CSV de candles", () => {
  it("MetaTrader 5: lê as linhas boas e explica cada linha estranha", async () => {
    const bytes = await readFile(MT5);
    expect(bytes.includes("\r\n")).toBe(true); // fim de linha do Windows, como o MT5 exporta
    const r = lerCsvCandles(bytes, { intervalo: "5m", fuso: SP });
    expect(r.formato).toBe("mt5");
    expect(r.candles.map((k) => k.abertura)).toEqual([
      brt(8, 55),
      brt(9, 0),
      brt(9, 5),
      brt(9, 10),
      brt(9, 30),
      brt(9, 35),
      brt(18, 30),
      brt(10, 0, 4),
    ]);
    expect(r.repetidos).toBe(1);
    expect(r.ignoradas.map((l) => l.linha)).toEqual([6, 7, 8, 10, 11, 14, 15]);
    expect(r.ignoradas.find((l) => l.linha === 6)?.motivo).toMatch(/colunas/);
    expect(r.ignoradas.find((l) => l.linha === 7)?.motivo).toMatch(/número inválido/);
    expect(r.ignoradas.find((l) => l.linha === 8)?.motivo).toMatch(/máxima abaixo/);
    expect(r.ignoradas.find((l) => l.linha === 10)?.motivo).toMatch(/grade de 5m/);
    expect(r.ignoradas.find((l) => l.linha === 11)?.motivo).toMatch(/data/);
    expect(r.ignoradas.find((l) => l.linha === 14)?.motivo).toMatch(/data/);
    expect(r.ignoradas.find((l) => l.linha === 15)?.motivo).toMatch(/hora/);
    const k930 = r.candles.find((k) => k.abertura === brt(9, 30));
    expect(k930?.maxima.toString()).toBe("128260");
    expect(k930?.volume.toString()).toBe("3600");
    const [k900] = r.candles.filter((k) => k.abertura === brt(9, 0));
    expect(k900?.fechamento).toBe(brt(9, 5) - 1);
    expect(k900?.volume.toString()).toBe("8312"); // <VOL> (contratos), não <TICKVOL>
    expect(r.candles.find((k) => k.abertura === brt(9, 35))?.fecha.toString()).toBe("128280.5");
  });

  it("MT5 exportado em UTF-16 com BOM (como o terminal costuma salvar)", async () => {
    const texto = (await readFile(MT5, "utf8")).replaceAll("\r\n", "\n");
    const utf16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(texto, "utf16le")]);
    const r = lerCsvCandles(utf16, { intervalo: "5m", fuso: SP });
    expect(r.formato).toBe("mt5");
    expect(r.candles).toHaveLength(8);
  });

  it("UTF-8 com BOM também", () => {
    const texto =
      "\uFEFF<DATE>\t<TIME>\t<OPEN>\t<HIGH>\t<LOW>\t<CLOSE>\t<TICKVOL>\t<VOL>\t<SPREAD>\n2026.07.01\t10:00:00\t1\t2\t1\t2\t3\t4\t0\n";
    const r = lerCsvCandles(Buffer.from(texto, "utf8"), { intervalo: "5m", fuso: SP });
    expect(r.candles[0]?.abertura).toBe(brt(10));
  });

  it("servidor do MT5 em outro fuso: --fuso +02:00 converte 16:00 do servidor para 11:00 de Brasília", () => {
    const texto =
      "<DATE>\t<TIME>\t<OPEN>\t<HIGH>\t<LOW>\t<CLOSE>\t<TICKVOL>\t<VOL>\t<SPREAD>\n2026.07.01\t16:00:00\t1\t2\t1\t2\t3\t4\t0\n";
    const r = lerCsvCandles(texto, { intervalo: "5m", fuso: lerFuso("+02:00") });
    expect(r.candles[0]?.abertura).toBe(brt(11));
  });

  it("MT5 sem a coluna <VOL> usa <TICKVOL>", () => {
    const texto =
      "<DATE>\t<TIME>\t<OPEN>\t<HIGH>\t<LOW>\t<CLOSE>\t<TICKVOL>\n2026.07.01\t10:00\t1\t2\t1\t2\t37\n";
    const r = lerCsvCandles(texto, { intervalo: "5m", fuso: SP });
    expect(r.candles[0]?.volume.toString()).toBe("37");
  });

  it("CSV genérico: data,hora,abertura,maxima,minima,fechamento,volume", () => {
    const texto = [
      "data,hora,abertura,maxima,minima,fechamento,volume",
      "2026-07-01,10:00,128000,128100,127950,128050,10",
      "01/07/2026,10:15:00,128050,128150,128000,128120,20",
      "2026-07-01,10:30,128120,128200,128100,128180",
    ].join("\n");
    const r = lerCsvCandles(texto, { intervalo: "15m", fuso: SP });
    expect(r.formato).toBe("generico");
    expect(r.candles.map((k) => k.abertura)).toEqual([brt(10), brt(10, 15)]);
    expect(r.candles[1]?.fechamento).toBe(brt(10, 30) - 1);
    expect(r.ignoradas).toEqual([{ linha: 4, motivo: expect.stringMatching(/colunas/) as unknown }]);
  });

  it("CSV genérico com ponto e vírgula, vírgula decimal e acentos no cabeçalho (planilha brasileira)", () => {
    const texto = [
      "Data;Hora;Abertura;Máxima;Mínima;Fechamento;Volume",
      "01/07/2026;10:00;128.000,50;128.100;127.950;128.050,25;1.500",
    ].join("\r\n");
    const r = lerCsvCandles(texto, { intervalo: "1h", fuso: SP });
    const [k] = r.candles;
    expect(k?.abre.toString()).toBe("128000.5");
    expect(k?.fecha.toString()).toBe("128050.25");
    expect(k?.volume.toString()).toBe("1500");
    expect(k?.fechamento).toBe(brt(11) - 1);
  });

  it("1h exige candle na hora cheia", () => {
    const texto = "data,hora,abertura,maxima,minima,fechamento,volume\n2026-07-01,10:05,1,2,1,2,1\n";
    const r = lerCsvCandles(texto, { intervalo: "1h", fuso: SP });
    expect(r.candles).toHaveLength(0);
    expect(r.ignoradas[0]?.motivo).toMatch(/grade de 1h/);
  });

  it("formato forçado que não bate com o cabeçalho é recusado", () => {
    const texto = "data,hora,abertura,maxima,minima,fechamento,volume\n";
    expect(() => lerCsvCandles(texto, { intervalo: "5m", fuso: SP, formato: "mt5" })).toThrow(/cabeçalho/);
  });

  it("cabeçalho desconhecido ou arquivo vazio: erro explicando os formatos aceitos", () => {
    expect(() => lerCsvCandles("time,o,h,l,c\n1,2,3,4,5\n", { intervalo: "5m", fuso: SP })).toThrow(
      /<DATE>.*data,hora/,
    );
    expect(() => lerCsvCandles("", { intervalo: "5m", fuso: SP })).toThrow(/vazio/);
    expect(() => lerCsvCandles("\n\n", { intervalo: "5m", fuso: SP })).toThrow(/vazio/);
  });

  it("genérico sem uma coluna obrigatória: diz qual falta", () => {
    expect(() =>
      lerCsvCandles("data,hora,abertura,maxima,minima,fechamento\n", { intervalo: "5m", fuso: SP }),
    ).toThrow(/falta a coluna volume/);
  });

  it("preço negativo, zero ou volume negativo são recusados", () => {
    const texto = [
      "data,hora,abertura,maxima,minima,fechamento,volume",
      "2026-07-01,10:00,0,2,0,1,1",
      "2026-07-01,10:05,1,2,1,2,-1",
      "2026-07-01,10:10,1,2,1,2,1",
    ].join("\n");
    const r = lerCsvCandles(texto, { intervalo: "5m", fuso: SP });
    expect(r.candles).toHaveLength(1);
    expect(r.ignoradas.map((l) => l.linha)).toEqual([2, 3]);
  });
});
