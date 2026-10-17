import type { Candle } from "@zentrade/dominio";
import type { IntervaloB3, SimboloB3 } from "./pregao.js";

/** Janela pedida a uma fonte: [desde, ate), em ms UTC. */
export interface PedidoFonte {
  readonly intervalo: IntervaloB3;
  readonly desde: number;
  readonly ate: number;
}

export interface LoteFonte {
  /** Candles válidos, em ordem; o filtro de pregão e de candle em formação vem depois. */
  readonly candles: Candle[];
  /** Pontos que a fonte mandou sem preço ou com preço impossível. */
  readonly ignorados: number;
  /** De onde veio, para a saída do comando (sem token nem segredo). */
  readonly descricao: string;
}

/**
 * Uma fonte de candles intradiários da B3. Trocar de fonte (outra API, um arquivo) é
 * escrever outra implementação desta porta e registrá-la no comando
 * `importar-candles-b3` (veja docs/dados-b3.md).
 */
export interface FonteCandlesB3 {
  readonly nome: string;
  /** O símbolo gravado no banco (`WIN-IBOV` para o índice, `WIN` para o contrato). */
  readonly simbolo: SimboloB3;
  buscar(p: PedidoFonte): Promise<LoteFonte>;
}
