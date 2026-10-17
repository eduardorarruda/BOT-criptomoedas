import { describe, expect, it, vi } from "vitest";
import { cacheDeCandlesDoBacktest, redeDosDadosAoVivo } from "./dados-backtest.js";

function bancoFalso() {
  return {
    candles: vi.fn(async () => [
      { abertura: 1, abre: "1", maxima: "1", minima: "1", fecha: "1", volume: "1" },
    ]),
    gravar: vi.fn(async () => undefined),
  };
}
const consulta = (simbolo: string) => ({ simbolo, intervalo: "5m" as const, inicio: 0, fim: 1 });

describe("dados do backtest", () => {
  it("a rede das velas ao vivo: no papel, a de onde vêm os dados; na testnet, a testnet", () => {
    expect(redeDosDadosAoVivo({ MOTOR_REDE: "papel", MOTOR_PAPEL_DADOS: "real" })).toBe("real");
    expect(redeDosDadosAoVivo({ MOTOR_REDE: "papel", MOTOR_PAPEL_DADOS: "testnet" })).toBe("testnet");
    expect(redeDosDadosAoVivo({ MOTOR_REDE: "testnet", MOTOR_PAPEL_DADOS: "real" })).toBe("testnet");
  });

  it("motor com velas da Binance real: o backtest usa o cache do banco como está", async () => {
    const banco = bancoFalso();
    const cache = cacheDeCandlesDoBacktest("real", banco);
    expect(cache).toBe(banco);
  });

  it("motor na testnet: cripto ignora o cache (preço de testnet não é mercado), B3 segue no banco", async () => {
    const banco = bancoFalso();
    const cache = cacheDeCandlesDoBacktest("testnet", banco);
    expect(await cache.candles(consulta("BTCUSDT"))).toEqual([]);
    await cache.gravar("BTCUSDT", "5m", []);
    expect(banco.candles).not.toHaveBeenCalled();
    expect(banco.gravar).not.toHaveBeenCalled();
    expect(await cache.candles(consulta("WIN-IBOV"))).toHaveLength(1);
    expect(await cache.candles(consulta("WIN"))).toHaveLength(1);
    await cache.gravar("WIN-IBOV", "5m", []);
    expect(banco.gravar).toHaveBeenCalledOnce();
  });
});
