/**
 * Endereços oficiais da API spot (developers.binance.com, conferidos em 2026-10).
 * Uma rede por corretora: o bot antigo lia preço da real e operava na testnet.
 */
export const URLS_BINANCE = {
  real: { rest: "https://api.binance.com", websocket: "wss://stream.binance.com:9443" },
  testnet: { rest: "https://testnet.binance.vision", websocket: "wss://stream.testnet.binance.vision" },
} as const;

export type RedeBinance = keyof typeof URLS_BINANCE;
