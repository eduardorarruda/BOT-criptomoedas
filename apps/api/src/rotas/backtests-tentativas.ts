import type { Backtest, TentativaBacktest } from "@zentrade/banco";
import type { TentativasBacktest } from "@zentrade/contratos";
import { avaliarTentativas } from "@zentrade/financas";

/** O pedaço do repositório de backtests que conta as tentativas. */
export interface FonteTentativas {
  tentativas(usuarioId: string, estrategiaIds: readonly string[]): Promise<TentativaBacktest[]>;
}

/**
 * Tentativas do backtest `b`: os backtests concluídos da mesma estratégia (todas as
 * versões) criados até ele, ele incluído. Com elas, o Sharpe deflacionado e a duração
 * mínima do backtest. `null` enquanto o backtest não terminou.
 */
export function tentativasDo(b: Backtest, todas: readonly TentativaBacktest[]): TentativasBacktest | null {
  const m = b.metricas;
  if (b.estado !== "concluido" || !m) return null;
  const anteriores = todas.filter(
    (t) => t.estrategiaId === b.estrategiaId && t.id !== b.id && t.criadoEm <= b.criadoEm,
  );
  const lista = [...anteriores, { versao: b.versao, sharpe: m.sharpe ?? null }];
  const { tentativas: total, ...avaliacao } = avaliarTentativas(
    {
      sharpeAnual: m.sharpe ?? null,
      observacoes: m.observacoes ?? 0,
      assimetria: m.assimetria ?? 0,
      curtose: m.curtose ?? 3,
      barrasPorAno: m.barrasPorAno ?? 0,
      anos: m.anos ?? 0,
    },
    lista.map((t) => t.sharpe),
  );
  return {
    total,
    daVersao: lista.filter((t) => t.versao === b.versao).length,
    versoes: new Set(lista.map((t) => t.versao)).size,
    ...avaliacao,
  };
}

/** Uma consulta só para a lista inteira: as tentativas das estratégias que aparecem nela. */
export async function comTentativas<B extends Backtest>(
  fonte: FonteTentativas,
  usuarioId: string,
  lista: readonly B[],
): Promise<(B & { tentativas: TentativasBacktest | null })[]> {
  const ids = [...new Set(lista.filter((b) => b.estado === "concluido").map((b) => b.estrategiaId))];
  const todas = await fonte.tentativas(usuarioId, ids);
  return lista.map((b) => ({ ...b, tentativas: tentativasDo(b, todas) }));
}
