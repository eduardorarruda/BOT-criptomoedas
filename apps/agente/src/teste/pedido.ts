import type { OperacaoPedido, PedidoAnalise, VelasPedido } from "@zentrade/contratos";
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

/** A operação do modelo Donchian 20/10 em cripto, como o motor manda. */
export const OPERACAO_DONCHIAN: OperacaoPedido = {
  sentido: "comprado",
  custos: { mercado: "cripto", taxaPorLado: 0.001, deslizamentoBps: 5, meioSpreadBps: 2 },
  stopPercentual: 0.1,
  stopAtr: { periodo: 20, multiplo: 2 },
  tamanhoPorVolatilidade: { periodo: 20, multiplo: 2 },
  alvoLiquido: 0.6,
  regraSaida: "preço < fundo de Donchian(10)",
};

const CINCO_MIN = 300_000;

/**
 * Velas de 5 min terminando no fechamento dado: oscilam ±0,5% em torno de `base`,
 * com máxima e mínima a `amplitude` do fechamento e volume 100 (a última, `volumeFinal`).
 */
export function velasDeTeste(o: {
  readonly quantidade: number;
  readonly base: number;
  readonly amplitude: number;
  readonly inicio: number;
  readonly volumeFinal?: number;
  readonly intervaloMs?: number;
}): { fechamentos: number[]; velas: VelasPedido } {
  const passo = o.intervaloMs ?? CINCO_MIN;
  const fechamentos = Array.from(
    { length: o.quantidade },
    (_, i) => Math.round((o.base + Math.sin(i / 5) * o.base * 0.005) * 100) / 100,
  );
  return {
    fechamentos,
    velas: {
      instantes: fechamentos.map((_, i) => o.inicio + i * passo),
      maximas: fechamentos.map((f) => f + o.amplitude),
      minimas: fechamentos.map((f) => f - o.amplitude),
      volumes: fechamentos.map((_, i) => (i === o.quantidade - 1 ? (o.volumeFinal ?? 100) : 100)),
    },
  };
}
