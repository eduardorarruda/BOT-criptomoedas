import type { Backtest } from "../api/esquemas";
import { maiorQueda, variacao } from "../lib/metricas";
import { criarAleatorio, normal } from "./aleatorio";
import { dec } from "@zentrade/dominio";

/** Resultado simulado de um backtest pedido na tela do exemplo. */
export function simularBacktest(pedido: Backtest): Backtest {
  const inicio = pedido.inicio ?? 0;
  const fim = pedido.fim ?? inicio + 1;
  const aleatorio = criarAleatorio(Math.floor(inicio / 1000) ^ (pedido.versao ?? 1));
  const n = 80;
  const passo = (fim - inicio) / (n - 1);
  let valor = dec(pedido.capitalInicial ?? "1000");
  const curva = Array.from({ length: n }, (_, i) => {
    const ponto = { em: Math.round(inicio + i * passo), valor: valor.toFixed(2) };
    valor = valor.plus((normal(aleatorio) * 5 + 0.2).toFixed(2));
    return ponto;
  });
  const valores = curva.map((p) => p.valor);
  const v = variacao(valores);
  const operacoes = 20 + Math.floor(aleatorio() * 30);
  return {
    ...pedido,
    estado: "concluido",
    curva,
    metricas: {
      resultado: v.absoluta,
      resultadoPercentual: v.fracao,
      maiorQueda: maiorQueda(valores),
      taxas: dec(operacoes).times("0.48").toFixed(2),
      operacoes,
      acertos: Math.floor(operacoes * (0.4 + aleatorio() * 0.2)),
    },
  };
}
