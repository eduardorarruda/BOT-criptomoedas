import type { PedidoAnalise } from "@zentrade/contratos";
import { contextoDeCandles, POSICAO_ZERADA, type Candle, type Estrategia } from "@zentrade/dominio";
import { custosCriptoDoPedido, operacaoDoPedido, velasDoPedido } from "../nucleo/contexto-operacao.js";
import type { SinalReplay } from "./sinais.js";

/**
 * O pedido ao agente exatamente como o robô ao vivo o montaria no fechamento do candle do
 * sinal: só os candles até ele (o histórico de `historico` velas), posição zerada e o
 * `ate` que liga o modo replay do agente (sem banco ao vivo; "agora" = o instante do sinal).
 * Sem orçamento de risco: não existe robô, saldo nem exposição num replay.
 */
export function pedidoDoReplay(
  s: SinalReplay,
  candles: readonly Candle[],
  estrategia: Estrategia,
  historico: number,
  intervalo: PedidoAnalise["robo"]["intervalo"],
): PedidoAnalise {
  const ctx = contextoDeCandles(candles.slice(Math.max(0, s.indice + 1 - historico), s.indice + 1));
  const velas = velasDoPedido(ctx);
  return {
    robo: { id: `replay-${s.simbolo.toLowerCase()}`, simbolo: s.simbolo, intervalo },
    sinal: s.sinal,
    preco: s.preco,
    fechamentos: ctx.fechamentos,
    posicao: POSICAO_ZERADA,
    operacao: operacaoDoPedido(estrategia, custosCriptoDoPedido(estrategia), "comprado"),
    ...(velas ? { velas } : {}),
    ate: s.ate,
  };
}
