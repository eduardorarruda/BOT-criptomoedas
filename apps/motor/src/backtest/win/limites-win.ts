import type { AvisoBacktest, ConfiguracaoBacktest } from "@zentrade/contratos";
import { formatarReais, type LimitesRisco, type Valor } from "@zentrade/dominio";
import { limitesDoBacktest } from "../limites.js";

/** Quantas perdas cheias (do risco por operação) a perda diária padrão do WIN comporta. */
export const PERDAS_CHEIAS_POR_DIA = 3;

/**
 * Os limites do robô no backtest do mini índice. O padrão genérico (perda diária de 2%
 * do capital) pode ficar MENOR que o risco de uma operação do WIN, que vem em reais: aí
 * a primeira perda encerra o dia e o backtest barra todas as entradas seguintes sem
 * dizer nada. Sem limites informados, a perda diária sobe até comportar 3 perdas
 * cheias; com limites informados, eles valem como estão e o resultado avisa.
 */
export function limitesDoWin(
  config: ConfiguracaoBacktest,
  saldo: Valor,
  riscoPorOperacao: Valor,
): { readonly limites: LimitesRisco; readonly avisos: readonly AvisoBacktest[] } {
  const { limites } = limitesDoBacktest(config, saldo, 0);
  if (config.risco.modo === "sem_limites") return { limites, avisos: [] };
  if (!config.risco.limites) {
    const minimo = riscoPorOperacao.times(PERDAS_CHEIAS_POR_DIA);
    const perdaDiariaMaxima = limites.perdaDiariaMaxima.lt(minimo) ? minimo : limites.perdaDiariaMaxima;
    return { limites: { ...limites, perdaDiariaMaxima }, avisos: [] };
  }
  if (limites.perdaDiariaMaxima.gte(riscoPorOperacao)) return { limites, avisos: [] };
  return {
    limites,
    avisos: [
      {
        codigo: "perda_diaria_menor_que_risco",
        nivel: "alerta",
        base: "heuristica",
        mensagem: `A perda diária (${formatarReais(limites.perdaDiariaMaxima)}) é menor que o risco de uma operação (${formatarReais(riscoPorOperacao)}): a primeira perda encerra o dia e as entradas seguintes são barradas. Suba a perda diária ou reduza o risco por operação.`,
      },
    ],
  };
}
