import { EventoSugeridoEsquema, MAX_EVENTOS_SUGERIDOS, type NovoEventoMercadoDTO } from "@zentrade/contratos";

/**
 * "Sugerir eventos da semana": o Claude lista eventos do calendário oficial para os
 * próximos dias; a resposta é DADO não confiável. Cada item passa por Zod (strict), o
 * que está fora do período ou inválido é descartado, nada é executado, e o que sobra
 * entra como `sugerido` para a pessoa confirmar ou remover.
 */
export function pedidoDeSugestao(de: string, ate: string): string {
  return [
    `Liste os eventos de mercado de ALTO ou MÉDIO impacto entre ${de} e ${ate} (inclusive) que afetam o mini índice (WIN, B3) ou criptomoedas: decisões do Copom, IPCA, payroll e CPI dos EUA, FOMC, eleições, feriados que fecham a B3 e similares.`,
    'Inclua somente eventos de calendário oficial que você conhece com segurança. Não invente datas nem eventos: se não tiver certeza da data, marque certeza "baixa"; se não souber de nenhum, devolva a lista vazia.',
    'Responda SOMENTE com JSON, sem texto antes ou depois, neste formato: {"eventos":[{"data":"AAAA-MM-DD","mercado":"win"|"cripto"|"todos","titulo":"texto curto","impacto":"alto"|"medio","certeza":"alta"|"media"|"baixa"}]}.',
    'Use "data" no dia de Brasília. Opcionalmente "de" e "ate" (HH:MM, horário de Brasília) quando o evento tiver horário conhecido. Não use ferramentas.',
  ].join("\n");
}

export interface SugestaoLida {
  readonly eventos: NovoEventoMercadoDTO[];
  /** Itens que o Claude mandou e foram descartados (inválidos, fora do período ou além do limite). */
  readonly descartados: number;
}

const AVISO_BAIXA = " (data a confirmar)";
const TITULO_MAX = 120;

function jsonDe(texto: string): unknown {
  const cerca = /```(?:json)?\s*([\s\S]*?)```/i.exec(texto);
  const candidato = cerca?.[1] ?? texto;
  const ini = candidato.indexOf("{");
  const fim = candidato.lastIndexOf("}");
  if (ini < 0 || fim <= ini) return null;
  try {
    return JSON.parse(candidato.slice(ini, fim + 1));
  } catch {
    return null;
  }
}

export function extrairSugestao(texto: string, periodo: { de: string; ate: string }): SugestaoLida {
  const bruto = jsonDe(texto);
  const lista =
    bruto && typeof bruto === "object" && "eventos" in bruto && Array.isArray(bruto.eventos)
      ? (bruto.eventos as unknown[])
      : [];
  const eventos: NovoEventoMercadoDTO[] = [];
  for (const item of lista.slice(0, MAX_EVENTOS_SUGERIDOS * 2)) {
    const lido = EventoSugeridoEsquema.safeParse(item);
    if (!lido.success || lido.data.data < periodo.de || lido.data.data > periodo.ate) continue;
    if (eventos.length >= MAX_EVENTOS_SUGERIDOS) continue;
    const { certeza, ...evento } = lido.data;
    eventos.push(
      certeza === "baixa"
        ? { ...evento, titulo: `${evento.titulo.slice(0, TITULO_MAX - AVISO_BAIXA.length)}${AVISO_BAIXA}` }
        : evento,
    );
  }
  return { eventos, descartados: lista.length - eventos.length };
}
