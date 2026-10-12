import type { LimitesContaDTO, OrcamentoIa, SituacaoRede } from "@zentrade/contratos/esquemas";
import { dec, type Valor } from "@zentrade/dominio";
import { LIMIAR_ATENCAO, type NivelMedidor } from "../../lib/aovivo/risco";

/**
 * O estado de cada limite da conta numa rede, para as barras da tela de Risco. Sem
 * limite configurado, o valor aparece sem barra (`limite: null`).
 */
export interface MedidorConta {
  readonly id: string;
  readonly rotulo: string;
  readonly valor: string;
  readonly limite: string | null;
  readonly formato: "dinheiro" | "numero";
  /** 0 a 1 (corta em 1) para a barra. */
  readonly fracao: number;
  readonly nivel: NivelMedidor;
}

function medir(valor: Valor, limite: string | number | null): Pick<MedidorConta, "fracao" | "nivel"> {
  if (limite === null) return { fracao: 0, nivel: "ok" };
  const l = dec(limite);
  if (l.lte(0)) return { fracao: 1, nivel: "limite" };
  const bruta = valor.div(l);
  const nivel: NivelMedidor = bruta.gte(1) ? "limite" : bruta.gte(LIMIAR_ATENCAO) ? "atencao" : "ok";
  return { fracao: Math.min(1, Math.max(0, bruta.toNumber())), nivel };
}

const texto = (l: string | number | null): string | null => (l === null ? null : String(l));

export function medidoresDaRede(r: SituacaoRede, l: LimitesContaDTO): MedidorConta[] {
  const perda = dec(r.perdaDoDia).isNegative() ? dec(r.perdaDoDia).neg() : dec(0);
  return [
    {
      id: "perda",
      rotulo: l.incluirNaoRealizado ? "Perda do dia (com o não realizado)" : "Perda do dia (realizada)",
      valor: perda.toFixed(2),
      limite: l.perdaDiariaMaxima,
      formato: "dinheiro",
      ...medir(perda, l.perdaDiariaMaxima),
    },
    {
      id: "exposicao",
      rotulo: "Exposição somando os robôs",
      valor: dec(r.exposicao).toFixed(2),
      limite: l.exposicaoMaxima,
      formato: "dinheiro",
      ...medir(dec(r.exposicao), l.exposicaoMaxima),
    },
    {
      id: "posicoes",
      rotulo: "Posições abertas",
      valor: String(r.posicoesAbertas),
      limite: texto(l.posicoesAbertasMax),
      formato: "numero",
      ...medir(dec(r.posicoesAbertas), l.posicoesAbertasMax),
    },
    {
      id: "queda",
      rotulo: `Queda do pico (${l.quedaJanelaHoras} h)`,
      valor: dec(r.queda).toFixed(2),
      limite: l.quedaMaxima,
      formato: "dinheiro",
      ...medir(dec(r.queda), l.quedaMaxima),
    },
    {
      id: "stops",
      rotulo: `Saídas com perda (${l.sequenciaStopsJanelaHoras} h)`,
      valor: String(r.saidasComPerda),
      limite: texto(l.sequenciaStopsMax),
      formato: "numero",
      ...medir(dec(r.saidasComPerda), l.sequenciaStopsMax),
    },
  ];
}

/** As barras do orçamento de IA: o mês e, se houver, o dia. */
export function medidoresDoOrcamento(o: OrcamentoIa): MedidorConta[] {
  const mes: MedidorConta = {
    id: "ia-mes",
    rotulo: "Gasto com IA no mês",
    valor: dec(o.gastoMes).toFixed(2),
    limite: o.limiteMensal,
    formato: "dinheiro",
    ...medir(dec(o.gastoMes), o.limiteMensal),
  };
  if (o.limiteDiario === null) return [mes];
  return [
    mes,
    {
      id: "ia-dia",
      rotulo: "Gasto com IA hoje",
      valor: dec(o.gastoDia).toFixed(2),
      limite: o.limiteDiario,
      formato: "dinheiro",
      ...medir(dec(o.gastoDia), o.limiteDiario),
    },
  ];
}
