import { dec, paraTexto, type Valor } from "@zentrade/dominio";
import { asc, eq, sql } from "drizzle-orm";
import type { Db } from "../cliente.js";
import { replayAnalises, VEREDITOS_REPLAY } from "../esquema/index.js";

export type VereditoReplay = (typeof VEREDITOS_REPLAY)[number];

export interface NovaAnaliseReplay {
  readonly execucao: string;
  readonly simbolo: string;
  readonly sinalEm: number;
  readonly preco: Valor;
  readonly sinal: unknown;
  readonly proposta: unknown;
  readonly veredito: VereditoReplay;
  readonly custoIaUsd: Valor;
}

export interface AnaliseReplay extends Omit<NovaAnaliseReplay, "preco" | "custoIaUsd"> {
  readonly preco: Valor;
  readonly custoIaUsd: Valor;
}

/**
 * O armazém do replay (tabela replay_analises). Só o comando de replay usa; nada daqui
 * toca em decisoes, ordens ou no placar ao vivo.
 */
export function repositorioReplay(db: Db) {
  return {
    /** Grava a análise; repetir a mesma (execução, símbolo, instante) não duplica. */
    async gravar(a: NovaAnaliseReplay): Promise<void> {
      await db
        .insert(replayAnalises)
        .values({
          execucao: a.execucao,
          simbolo: a.simbolo,
          sinalEm: new Date(a.sinalEm),
          preco: paraTexto(a.preco),
          sinal: a.sinal,
          proposta: a.proposta,
          veredito: a.veredito,
          custoIaUsd: paraTexto(a.custoIaUsd),
        })
        .onConflictDoNothing();
    },

    /** As análises da rodada, em ordem cronológica. */
    async listar(execucao: string): Promise<AnaliseReplay[]> {
      const linhas = await db
        .select()
        .from(replayAnalises)
        .where(eq(replayAnalises.execucao, execucao))
        .orderBy(asc(replayAnalises.sinalEm), asc(replayAnalises.simbolo));
      return linhas.map((l) => ({
        execucao: l.execucao,
        simbolo: l.simbolo,
        sinalEm: l.sinalEm.getTime(),
        preco: dec(l.preco),
        sinal: l.sinal,
        proposta: l.proposta,
        veredito: l.veredito,
        custoIaUsd: dec(l.custoIaUsd),
      }));
    },

    /** Quanto a rodada já gastou com o agente (US$). */
    async custoTotal(execucao: string): Promise<Valor> {
      const [r] = await db
        .select({ total: sql<string>`coalesce(sum(${replayAnalises.custoIaUsd}), 0)` })
        .from(replayAnalises)
        .where(eq(replayAnalises.execucao, execucao));
      return dec(r?.total ?? 0);
    },
  };
}

export type RepositorioReplay = ReturnType<typeof repositorioReplay>;
