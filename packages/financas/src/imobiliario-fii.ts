import type { Valor } from "@zentrade/dominio";
import { exigirInteiro, exigirNaoNegativo, exigirPositivo, razao, ZERO } from "./imobiliario-comum.js";
import { cotasParaRenda, rendaFii } from "./imobiliario-indicadores.js";

/**
 * Simulador de FII: renda mensal para X cotas e, se pedido, a evolução reinvestindo
 * os rendimentos em cotas inteiras. Premissa forte: preço e rendimento por cota
 * constantes — na vida real os dois variam todo mês e o rendimento pode cair.
 */
export interface ParametrosSimulacaoFii {
  readonly cotas: number;
  readonly precoCota: Valor;
  readonly rendimentoMensalPorCota: Valor;
  readonly meses: number;
  readonly reinvestir?: boolean;
  readonly rendaAlvo?: Valor;
}

export interface MesFii {
  readonly mes: number;
  readonly cotas: number;
  readonly renda: Valor;
  readonly rendaAcumulada: Valor;
  /** Sobra que não completou uma cota (só reinvestindo). */
  readonly caixa: Valor;
  readonly patrimonio: Valor;
}

export interface ResultadoSimulacaoFii {
  readonly investimento: Valor;
  readonly rendaMensal: Valor;
  readonly dyMensal: number | null;
  readonly dyAnual: number | null;
  readonly meses: readonly MesFii[];
  readonly cotasParaAlvo: number | null;
  readonly investimentoParaAlvo: Valor | null;
  readonly premissas: readonly string[];
}

const PREMISSAS = [
  "Preço e rendimento por cota constantes durante todo o período.",
  "Sem imposto de renda nesta conta; confira a regra vigente para os rendimentos e para a venda de cotas.",
  "Reinvestindo, compra só cotas inteiras, sem custos de corretagem.",
];

export function simularFii(p: ParametrosSimulacaoFii): ResultadoSimulacaoFii {
  exigirInteiro(p.cotas, "as cotas", 0, Number.MAX_SAFE_INTEGER);
  exigirInteiro(p.meses, "os meses", 1, 600);
  exigirPositivo(p.precoCota, "o preço da cota");
  exigirNaoNegativo(p.rendimentoMensalPorCota, "o rendimento por cota");
  const meses: MesFii[] = [];
  let cotas = p.cotas;
  let caixa = ZERO;
  let acumulada = ZERO;
  for (let mes = 1; mes <= p.meses; mes++) {
    const renda = rendaFii(cotas, p.rendimentoMensalPorCota);
    acumulada = acumulada.plus(renda);
    if (p.reinvestir) {
      const disponivel = caixa.plus(renda);
      const novas = disponivel.div(p.precoCota).floor().toNumber();
      cotas += novas;
      caixa = disponivel.minus(p.precoCota.times(novas));
    }
    meses.push({
      mes,
      cotas,
      renda,
      rendaAcumulada: acumulada,
      caixa,
      patrimonio: p.precoCota.times(cotas).plus(caixa),
    });
  }
  const dyMensal = razao(p.rendimentoMensalPorCota, p.precoCota);
  const cotasParaAlvo = p.rendaAlvo ? cotasParaRenda(p.rendaAlvo, p.rendimentoMensalPorCota) : null;
  return {
    investimento: p.precoCota.times(p.cotas),
    rendaMensal: rendaFii(p.cotas, p.rendimentoMensalPorCota),
    dyMensal,
    dyAnual: dyMensal === null ? null : dyMensal * 12,
    meses,
    cotasParaAlvo,
    investimentoParaAlvo: cotasParaAlvo === null ? null : p.precoCota.times(cotasParaAlvo),
    premissas: PREMISSAS,
  };
}
