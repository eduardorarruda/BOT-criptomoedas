import type { EstadoConexao } from "@zentrade/contratos";
import type { Candle } from "@zentrade/dominio";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WebSocketServer, type WebSocket } from "ws";
import { assinarKlines, calcularEspera } from "./websocket.js";
import { esperarAte } from "./teste/esperar.js";

const kline = (abertura: number, fechado: boolean, fecha = "100.5") =>
  JSON.stringify({
    e: "kline",
    E: abertura + 1,
    s: "BTCUSDT",
    k: {
      t: abertura,
      T: abertura + 59_999,
      s: "BTCUSDT",
      i: "1m",
      o: "100",
      c: fecha,
      h: "101",
      l: "99",
      v: "12.5",
      x: fechado,
    },
  });

describe("assinatura de candles por WebSocket", () => {
  let servidor: WebSocketServer;
  let conexoes: WebSocket[];
  let caminhos: string[];
  let url: string;
  let encerrar: (() => void) | undefined;

  beforeEach(async () => {
    conexoes = [];
    caminhos = [];
    servidor = new WebSocketServer({ port: 0 });
    servidor.on("connection", (ws, req) => {
      conexoes.push(ws);
      caminhos.push(req.url ?? "");
    });
    await new Promise<void>((r) => servidor.once("listening", () => r()));
    const { port } = servidor.address() as { port: number };
    url = `ws://127.0.0.1:${port}/ws/btcusdt@kline_1m`;
  });

  afterEach(async () => {
    encerrar?.();
    encerrar = undefined;
    await new Promise<void>((r) => servidor.close(() => r()));
  });

  function assinar(extra: Partial<Parameters<typeof assinarKlines>[0]> = {}) {
    const candles: Candle[] = [];
    const estados: EstadoConexao[] = [];
    const erros: Error[] = [];
    encerrar = assinarKlines({
      url,
      aoFechar: (c) => candles.push(c),
      aoEstado: (e) => estados.push(e),
      aoErro: (e) => erros.push(e),
      esperaInicialMs: 10,
      esperaMaximaMs: 50,
      ...extra,
    });
    return { candles, estados, erros };
  }

  it("só entrega candle fechado (k.x === true)", async () => {
    const { candles, estados } = assinar();
    await esperarAte(() => conexoes.length === 1 && estados.includes("conectado"));
    expect(caminhos[0]).toBe("/ws/btcusdt@kline_1m");
    conexoes[0]!.send(kline(60_000, false));
    conexoes[0]!.send(kline(60_000, false, "100.7"));
    conexoes[0]!.send(kline(60_000, true, "100.8"));
    await esperarAte(() => candles.length === 1);
    expect(candles[0]!.fecha.toFixed()).toBe("100.8");
    expect(candles[0]!.abertura).toBe(60_000);
    expect(candles[0]!.fechamento).toBe(119_999);
  });

  it("reconecta sozinha quando a conexão cai e avisa os estados", async () => {
    const { candles, estados } = assinar();
    await esperarAte(() => conexoes.length === 1 && estados.includes("conectado"));
    conexoes[0]!.terminate();
    await esperarAte(() => conexoes.length === 2 && estados.filter((e) => e === "conectado").length === 2);
    expect(estados).toEqual(["conectado", "reconectando", "conectado"]);
    conexoes[1]!.send(kline(120_000, true));
    await esperarAte(() => candles.length === 1);
  });

  it("reconecta preventivamente antes do limite de 24 h da Binance", async () => {
    const { estados } = assinar({ reconexaoPreventivaMs: 80 });
    await esperarAte(() => conexoes.length >= 2, 2_000);
    expect(estados.slice(0, 3)).toEqual(["conectado", "reconectando", "conectado"]);
  });

  it("conexão muda (sem mensagens nem ping) é derrubada e refeita", async () => {
    const { estados } = assinar({ silencioMaximoMs: 80 });
    await esperarAte(() => conexoes.length >= 2, 2_000);
    expect(estados).toContain("reconectando");
  });

  it("responde ao ping do servidor com pong", async () => {
    const { estados } = assinar();
    await esperarAte(() => conexoes.length === 1 && estados.includes("conectado"));
    let pong = false;
    conexoes[0]!.on("pong", () => (pong = true));
    conexoes[0]!.ping("oi");
    await esperarAte(() => pong);
  });

  it("mensagem inválida vira erro informado, sem derrubar a assinatura", async () => {
    const { candles, erros, estados } = assinar({
      aoFechar: () => {
        throw new Error("quem consome falhou");
      },
    });
    await esperarAte(() => conexoes.length === 1 && estados.includes("conectado"));
    conexoes[0]!.send("isto não é json");
    conexoes[0]!.send(JSON.stringify({ e: "kline", k: { t: "x" } }));
    conexoes[0]!.send(kline(60_000, true));
    await esperarAte(() => erros.length === 3);
    expect(erros[0]!.message).toMatch(/JSON/);
    expect(erros[1]!.message).toMatch(/formato/);
    expect(erros[2]!.message).toMatch(/quem consome falhou/);
    expect(candles).toHaveLength(0);
  });

  it("encerrar desliga de vez: não reconecta mais", async () => {
    const { estados } = assinar();
    await esperarAte(() => conexoes.length === 1 && estados.includes("conectado"));
    encerrar!();
    encerrar = undefined;
    await new Promise((r) => setTimeout(r, 100));
    expect(conexoes).toHaveLength(1);
    expect(estados.at(-1)).toBe("desconectado");
  });

  it("servidor fora do ar: continua tentando com espera crescente", async () => {
    await new Promise<void>((r) => servidor.close(() => r()));
    const { estados, erros } = assinar();
    await esperarAte(() => estados.filter((e) => e === "reconectando").length >= 3);
    expect(erros.length).toBeGreaterThan(0);
    servidor = new WebSocketServer({ port: 0 }); // para o afterEach
    await new Promise<void>((r) => servidor.once("listening", () => r()));
  });
});

describe("espera entre reconexões", () => {
  it("cresce exponencialmente, tem teto e jitter", () => {
    expect(calcularEspera(0, 1_000, 60_000, () => 0)).toBe(500);
    expect(calcularEspera(0, 1_000, 60_000, () => 1)).toBe(1_000);
    expect(calcularEspera(3, 1_000, 60_000, () => 1)).toBe(8_000);
    expect(calcularEspera(20, 1_000, 60_000, () => 1)).toBe(60_000);
    expect(calcularEspera(20, 1_000, 60_000, () => 0)).toBe(30_000);
  });
});
