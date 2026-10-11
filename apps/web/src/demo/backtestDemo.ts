import type { Backtest } from "../api/esquemas";
import { metricasDaCurva } from "../lib/metricas";
import { criarAleatorio, normal } from "./aleatorio";
import { dec } from "@zentrade/dominio";

/** Resultado simulado de um backtest pedido na tela do exemplo. */
export function simularBacktest(pedido: Backtest, agora: number): Backtest {
  const { inicio, fim } = pedido;
  const aleatorio = criarAleatorio(Math.floor(inicio / 1000) ^ pedido.versao);
  const n = 80;
  const passo = (fim - inicio) / (n - 1);
  let valor = dec("1000");
  const curva = Array.from({ length: n }, (_, i) => {
    const ponto = { em: Math.round(inicio + i * passo), patrimonio: valor.toFixed(2) };
    valor = valor.plus((normal(aleatorio) * 5 + 0.2).toFixed(2));
    return ponto;
  });
  const operacoes = 20 + Math.floor(aleatorio() * 30);
  const acertos = Math.floor(operacoes * (0.4 + aleatorio() * 0.2));
  return {
    ...pedido,
    estado: "concluido",
    curva,
    metricas: metricasDaCurva(curva, dec(operacoes).times("0.48").toFixed(2), operacoes, acertos),
    concluidoEm: agora,
  };
}
