import type { HistoricoSinal } from "@zentrade/contratos";
import { num, pct, pctSinal } from "./pedido/formato.js";

/**
 * A "máquina do tempo": o placar real da mesma regra no histórico do ativo, medido no
 * motor. Com amostra suficiente, é ele — e não o palpite do modelo — que diz se a
 * entrada compensa. Abaixo da amostra mínima, vale a regra dos cenários do modelo.
 */
export const AMOSTRA_MINIMA_TOTAL = 30;
export const AMOSTRA_MINIMA_RECORTE = 20;
/** As médias por operação são pequenas (centésimos de %): até 4 casas, para não virar "0%". */
export const CASAS_MEDIA = 4;

type Placar = HistoricoSinal["total"];

export interface RecorteDecisivo {
  readonly nome: "mesma faixa de horário" | "mesmo lado" | "total";
  readonly placar: Placar;
}

/** O recorte mais específico com amostra mínima: mesmo horário, depois mesmo lado, depois o total. */
export function recorteDecisivo(h: HistoricoSinal | undefined): RecorteDecisivo | null {
  if (!h || h.total.operacoes < AMOSTRA_MINIMA_TOTAL) return null;
  if (h.mesmoHorario && h.mesmoHorario.operacoes >= AMOSTRA_MINIMA_RECORTE)
    return { nome: "mesma faixa de horário", placar: h.mesmoHorario };
  if (h.mesmoLado && h.mesmoLado.operacoes >= AMOSTRA_MINIMA_RECORTE)
    return { nome: "mesmo lado", placar: h.mesmoLado };
  return { nome: "total", placar: h.total };
}

/** Fração de operações certas, com 4 casas (0 sem operações). */
export const taxaDeAcerto = (p: Placar): number =>
  p.operacoes === 0 ? 0 : Math.round((p.certas / p.operacoes) * 10_000) / 10_000;

const linhaPlacar = (rotulo: string, p: Placar): string =>
  `${rotulo}: ${num(p.operacoes, 0)} operações, ${num(p.certas, 0)} certas (${pct(taxaDeAcerto(p), 0)}), ` +
  `resultado médio ${pctSinal(p.resultadoMedio / 100, CASAS_MEDIA)} por operação.`;

/** As linhas da seção "Histórico da mesma regra" da mensagem ao modelo. */
export function linhasDoHistorico(h: HistoricoSinal): string[] {
  const s = h.simulacao;
  const decisivo = recorteDecisivo(h);
  return [
    `Fonte: ${h.fonte}.`,
    linhaPlacar("Total", h.total),
    ...(h.mesmoHorario ? [linhaPlacar("Mesma faixa de horário", h.mesmoHorario)] : []),
    ...(h.mesmoLado ? [linhaPlacar("Mesmo lado", h.mesmoLado)] : []),
    ...(s
      ? [
          `Simulação do resto da sessão (${num(s.replays, 0)} sorteios): alvo primeiro ${pct(s.alvoPrimeiro, 0)}, ` +
            `stop primeiro ${pct(s.stopPrimeiro, 0)}, nenhum ${pct(s.nenhum, 0)}; resultado médio ${pctSinal(s.resultadoMedio / 100, CASAS_MEDIA)}.`,
        ]
      : []),
    decisivo
      ? `Decide o código pelo recorte "${decisivo.nome}" (amostra mínima: ${AMOSTRA_MINIMA_TOTAL} no total, ${AMOSTRA_MINIMA_RECORTE} por recorte).`
      : `Amostra pequena (menos de ${AMOSTRA_MINIMA_TOTAL} operações): decidem os seus cenários; use o histórico só como referência.`,
  ];
}
