import type { BarraMt5, FonteBarrasMt5, PedidoBarrasMt5 } from "../dados-b3/fonte-mt5.js";

/**
 * Fonte MT5 de mentira: sem conta real disponível, os testes rodam contra esta. Devolve
 * sempre as mesmas barras configuradas (quem monta o teste já escolhe só as do pedido);
 * grava cada pedido recebido para conferir `de`/`ate`/`simbolo` nas asserções.
 */
export function fonteBarrasMt5Falsa(o: {
  readonly simbolos: readonly string[];
  readonly barras: readonly BarraMt5[];
}) {
  const pedidos: PedidoBarrasMt5[] = [];
  const fonte: FonteBarrasMt5 = {
    simbolosWin: async () => [...o.simbolos],
    barras: async (p) => {
      pedidos.push(p);
      return [...o.barras];
    },
  };
  return { fonte, pedidos };
}
