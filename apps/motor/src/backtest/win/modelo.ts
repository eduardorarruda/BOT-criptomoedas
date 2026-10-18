import type { ConfiguracaoWin } from "@zentrade/contratos";
import {
  dec,
  fatorSentido,
  reaisDosPontos,
  type CustosWin,
  type Sentido,
  type SessaoB3,
  type Valor,
} from "@zentrade/dominio";

/** O modelo do mini índice que o backtest usa: a configuração do pedido já em decimais. */
export interface ModeloWin {
  readonly custos: CustosWin;
  readonly sessao: SessaoB3;
  readonly margemPorContrato: Valor;
  readonly contratosMaximos: number;
  /** Quanto se aceita perder por operação, em reais, se o stop for atingido. */
  readonly riscoPorOperacao: Valor;
}

export function modeloWinDe(c: ConfiguracaoWin): ModeloWin {
  return {
    custos: {
      tarifaB3: dec(c.tarifaB3PorContrato),
      corretagem: dec(c.corretagemPorContrato),
      deslizamentoTicks: c.deslizamentoTicks,
    },
    sessao: {
      inicioEntradas: c.inicioEntradas,
      fimEntradas: c.fimEntradas,
      zeragem: c.zeragem,
      pularLeilaoAbertura: c.pularLeilaoAbertura,
    },
    margemPorContrato: dec(c.margemPorContrato),
    contratosMaximos: c.contratosMaximos,
    riscoPorOperacao: dec(c.riscoPorOperacao),
  };
}

/** Resultado em reais de `contratos` contratos de `de` até `ate`, no sentido da posição. */
export const resultadoEmReais = (sentido: Sentido, de: Valor, ate: Valor, contratos: number): Valor =>
  reaisDosPontos(ate.minus(de).times(fatorSentido(sentido)), contratos);
