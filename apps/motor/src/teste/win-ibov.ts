import { dec, type Candle } from "@zentrade/dominio";

const M5 = 300_000;
const HORA = 3_600_000;
/** 10:00 às 16:55 de Brasília: o horário do índice à vista (84 candles de 5m por pregão). */
const CANDLES_POR_PREGAO = 84;

/** Três pregões (quarta a sexta) de julho de 2026, à meia-noite UTC. */
export const PREGOES_SEMENTE = [Date.UTC(2026, 6, 1), Date.UTC(2026, 6, 2), Date.UTC(2026, 6, 3)] as const;

/** Abertura do i-ésimo candle de 5m de um pregão da semente (10:00 de Brasília = 13:00 UTC). */
export const aberturaSemente = (pregao: number, i: number) =>
  (PREGOES_SEMENTE[pregao] ?? 0) + 13 * HORA + i * M5;

/**
 * Semente determinística de `WIN-IBOV` em 5m: 3 pregões, 252 candles, preços em pontos
 * múltiplos de 5 perto de 128.000. Inventada (não é dado baixado de lugar nenhum): serve
 * para testes e para a demonstração do backtest de WIN.
 */
export function sementeWinIbov5m(): Candle[] {
  let preco = 128_000;
  return PREGOES_SEMENTE.flatMap((_, p) =>
    Array.from({ length: CANDLES_POR_PREGAO }, (_, i) => {
      // Passos pseudoaleatórios fixos (−20 a +20 pontos), com um leve viés por pregão.
      const passo = ((((i + 1) * 37 + p * 11) % 9) - 4) * 5 + (p - 1) * 5;
      const abre = preco;
      const fecha = abre + passo;
      preco = fecha;
      const abertura = aberturaSemente(p, i);
      return {
        abertura,
        fechamento: abertura + M5 - 1,
        abre: dec(abre),
        maxima: dec(Math.max(abre, fecha) + 15),
        minima: dec(Math.min(abre, fecha) - 10),
        fecha: dec(fecha),
        volume: dec(1000 + ((i * 53) % 400)),
      };
    }),
  );
}
