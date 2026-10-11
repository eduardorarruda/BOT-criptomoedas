import type { PedidoAnalise } from "@zentrade/contratos";
import { dec, POSICAO_ZERADA } from "@zentrade/dominio";

/** Pedido de exemplo: BTC com 30 fechamentos subindo de 59 000 a 60 450. */
export function pedidoExemplo(extra: Partial<PedidoAnalise> = {}): PedidoAnalise {
  return {
    robo: { id: "robo-1", simbolo: "BTCUSDT", intervalo: "1h" },
    sinal: {
      acao: "COMPRAR",
      stop: dec("58800"),
      alvo: dec("61000"),
      explicacao: "preço abaixo da média de 20",
    },
    preco: dec("60450"),
    fechamentos: Array.from({ length: 30 }, (_, i) => 59000 + i * 50),
    posicao: POSICAO_ZERADA,
    ...extra,
  };
}

export const USUARIO_TESTE = "7b0c8a52-1d2e-4c3b-9a8f-0e1d2c3b4a59";
