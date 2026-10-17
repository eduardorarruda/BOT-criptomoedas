import {
  limitesPadraoDoBacktest,
  type ConfiguracaoBacktest,
  type LimitesRiscoDTO,
} from "@zentrade/contratos";
import { dec, paraTexto, type LimitesRisco, type Valor } from "@zentrade/dominio";

const doDTO = (l: LimitesRiscoDTO): LimitesRisco => ({
  perdaDiariaMaxima: dec(l.perdaDiariaMaxima),
  exposicaoMaxima: dec(l.exposicaoMaxima),
  ordensPorHoraMax: l.ordensPorHoraMax,
  pausaAposPerdaMs: l.pausaAposPerdaMin * 60_000,
  confiancaMinima: l.confiancaMinima,
});

/**
 * `robo` (padrão): os limites do robô de verdade — os informados ou os de um robô novo
 * proporcionais ao saldo. `sem_limites`: só a estratégia, sem freio de perda diária,
 * frequência ou pausa após perda (menos realista); risco por operação do ambiente.
 */
export function limitesDoBacktest(
  c: ConfiguracaoBacktest,
  saldo: Valor,
  riscoSemLimites: number,
): { limites: LimitesRisco; riscoPorOperacao: Valor } {
  if (c.risco.modo === "sem_limites")
    return {
      limites: {
        perdaDiariaMaxima: saldo,
        exposicaoMaxima: saldo,
        ordensPorHoraMax: 1_000,
        pausaAposPerdaMs: 0,
        confiancaMinima: 0,
      },
      riscoPorOperacao: saldo.times(riscoSemLimites),
    };
  const l = c.risco.limites ?? limitesPadraoDoBacktest(paraTexto(saldo));
  return { limites: doDTO(l), riscoPorOperacao: dec(l.riscoPorOperacao) };
}
