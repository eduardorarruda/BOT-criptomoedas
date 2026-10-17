import { BinanceCorretora, disjuntorDaRede } from "@zentrade/corretora";
import type { CandlesDoBanco } from "./backtest/candles-historicos.js";
import type { Config } from "./config.js";
import type { Registro } from "./nucleo/tipos.js";

type Rede = "real" | "testnet";

/** De onde vêm as velas que o motor grava ao vivo: no papel, a rede dos dados; na testnet, a testnet. */
export function redeDosDadosAoVivo(c: Pick<Config, "MOTOR_REDE" | "MOTOR_PAPEL_DADOS">): Rede {
  return c.MOTOR_REDE === "papel" ? c.MOTOR_PAPEL_DADOS : "testnet";
}

/**
 * O backtest olha o mercado de verdade: os dados públicos da Binance real (sem chave,
 * sem dinheiro), qualquer que seja a rede dos robôs. A testnet guarda poucos dias e o
 * preço dela não é de mercado: um backtest nela não valida nada.
 */
export function criarDadosHistoricos(registro: Registro): BinanceCorretora {
  return new BinanceCorretora({
    rede: "real",
    aoErroWebSocket: (erro: Error) => registro.warn({ erro }, "WebSocket da Binance com problema"),
    disjuntor: disjuntorDaRede("real"),
  });
}

const ehDaB3 = (simbolo: string): boolean => simbolo.startsWith("WIN");

/**
 * O cache de velas do banco só serve ao backtest de cripto se o motor grava velas da
 * Binance real. Com o motor no papel com dados da testnet, ou na testnet, a tabela tem
 * preço de testnet: o backtest busca tudo na Binance real e não grava nada ali. As velas
 * da B3 (WIN, WIN-IBOV) vêm sempre do banco.
 */
export function cacheDeCandlesDoBacktest(redeAoVivo: Rede, banco: CandlesDoBanco): CandlesDoBanco {
  if (redeAoVivo === "real") return banco;
  return {
    candles: (c) => (ehDaB3(c.simbolo) ? banco.candles(c) : Promise.resolve([])),
    gravar: (simbolo, intervalo, lista) =>
      ehDaB3(simbolo) ? banco.gravar(simbolo, intervalo, lista) : Promise.resolve(),
  };
}
