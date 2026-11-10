import { contratosPeloRisco, dec, type CustosWin, type Valor } from "@zentrade/dominio";

/** O mini índice no papel da B3: o tamanho sai em contratos, como no backtest do WIN. */
export interface OpcoesWin {
  /** O símbolo do WIN no motor (WINBRL): só ele usa esta conta. */
  readonly simbolo: string;
  readonly margemPorContrato: Valor;
  readonly contratosMaximos: number;
  readonly custos: CustosWin;
}

const REAIS_POR_PONTO = dec("0.2");

/**
 * Contratos pela perda no stop (nota 04): ⌊risco ÷ (pontos de stop × R$ 0,20 + custos)⌋,
 * limitado pelo máximo e pela margem que cabe no saldo livre. O preço no motor já está
 * em reais por contrato, então a distância em pontos = (preço − stop) ÷ 0,20; a
 * distância de risco do sinal (ATR) vale quando for maior, como no dimensionamento comum.
 * O tamanho relativo (agente, dia de evento) reduz, arredondando para baixo.
 */
export function contratosDaEntrada(
  w: OpcoesWin,
  e: {
    readonly preco: Valor;
    readonly stop: Valor;
    readonly distanciaRisco?: Valor;
    readonly risco: Valor;
    readonly saldoLivre: Valor;
    readonly tamanhoRelativo: number;
  },
): Valor {
  const peloStop = e.preco.minus(e.stop);
  const distancia = e.distanciaRisco && e.distanciaRisco.gt(peloStop) ? e.distanciaRisco : peloStop;
  if (!distancia.gt(0)) return dec(0);
  const d = contratosPeloRisco({
    riscoPorOperacao: e.risco,
    distanciaPontos: distancia.div(REAIS_POR_PONTO),
    custos: w.custos,
    contratosMaximos: w.contratosMaximos,
    margemPorContrato: w.margemPorContrato,
    capital: e.saldoLivre,
  });
  return dec(d.contratos).times(e.tamanhoRelativo).floor();
}
