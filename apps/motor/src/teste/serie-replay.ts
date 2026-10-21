import { dec, type Candle } from "@zentrade/dominio";
import { aleatorio } from "../replay/aleatorio.js";

export const HORA = 3_600_000;

/** Candles de 1 h com passeio aleatório de tendência de alta: dá rompimentos de Donchian. */
export function serieDeAlta(inicio: number, quantidade: number, semente = 7): Candle[] {
  const sorteio = aleatorio(semente);
  let preco = 100;
  return Array.from({ length: quantidade }, (_, i) => {
    const abre = preco;
    preco = abre * (1 + (sorteio() - 0.46) * 0.03);
    const maxima = Math.max(abre, preco) * (1 + sorteio() * 0.004);
    const minima = Math.min(abre, preco) * (1 - sorteio() * 0.004);
    return {
      abertura: inicio + i * HORA,
      fechamento: inicio + (i + 1) * HORA - 1,
      abre: dec(abre.toFixed(4)),
      maxima: dec(maxima.toFixed(4)),
      minima: dec(minima.toFixed(4)),
      fecha: dec(preco.toFixed(4)),
      volume: dec(10),
    };
  });
}
