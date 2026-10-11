import { describe, expect, it } from "vitest";
import { ativosDoSimbolo } from "./ativos.js";
import { ErroConfiguracao } from "./erros.js";
import { URLS_BINANCE } from "./urls.js";

describe("ativos do símbolo", () => {
  it("separa base e cotação pelas cotações conhecidas", () => {
    expect(ativosDoSimbolo("BTCUSDT")).toEqual({ base: "BTC", cotacao: "USDT" });
    expect(ativosDoSimbolo("ETHFDUSD")).toEqual({ base: "ETH", cotacao: "FDUSD" });
    expect(ativosDoSimbolo("ETHBTC")).toEqual({ base: "ETH", cotacao: "BTC" });
  });

  it("símbolo sem cotação conhecida explica como resolver", () => {
    expect(() => ativosDoSimbolo("XYZABC")).toThrow(ErroConfiguracao);
    expect(() => ativosDoSimbolo("USDT")).toThrow(/cotação/);
  });
});

describe("endereços da Binance", () => {
  it("testnet e real nunca se misturam", () => {
    expect(URLS_BINANCE.testnet.rest).toBe("https://testnet.binance.vision");
    expect(URLS_BINANCE.testnet.websocket).toBe("wss://stream.testnet.binance.vision");
    expect(URLS_BINANCE.real.rest).toBe("https://api.binance.com");
    expect(URLS_BINANCE.real.websocket).toBe("wss://stream.binance.com:9443");
  });
});
