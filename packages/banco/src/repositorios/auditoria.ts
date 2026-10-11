import { sql } from "drizzle-orm";
import type { Db, Executor } from "../cliente.js";
import { auditoria } from "../esquema/index.js";

/**
 * Inclui um registro na trilha. O hash e o encadeamento são feitos por gatilho no
 * banco (serializado por trava), então nenhum chamador consegue montar uma cadeia falsa.
 */
export async function auditar(
  executor: Executor,
  usuarioId: string | null,
  acao: string,
  alvo?: string,
  detalhes: Record<string, unknown> = {},
): Promise<void> {
  await executor.insert(auditoria).values({ usuarioId, acao, alvo: alvo ?? null, detalhes });
}

export interface VerificacaoAuditoria {
  readonly integra: boolean;
  readonly registros: number;
  /** Primeiro registro (sequência) em que a cadeia não bate. */
  readonly quebraEm?: number;
}

interface LinhaVerificacao extends Record<string, unknown> {
  sequencia: number;
  confere: boolean;
}

export function repositorioAuditoria(db: Db) {
  return {
    registrar: (r: {
      usuarioId: string | null;
      acao: string;
      alvo?: string;
      detalhes?: Record<string, unknown>;
    }): Promise<void> => auditar(db, r.usuarioId, r.acao, r.alvo, r.detalhes),

    /** Recalcula a cadeia inteira de uma pessoa (ou do sistema, com `null`). */
    async verificar(usuarioId: string | null): Promise<VerificacaoAuditoria> {
      const linhas = await db.execute<LinhaVerificacao>(sql`
        select sequencia,
               hash = auditoria_hash(hash_anterior, usuario_id, em, acao, alvo, detalhes)
               and hash_anterior = coalesce(lag(hash) over (order by sequencia), repeat('0', 64)) as confere
        from auditoria
        where usuario_id is not distinct from ${usuarioId}::uuid
        order by sequencia`);
      const quebra = linhas.find((l) => !l.confere);
      return {
        integra: !quebra,
        registros: linhas.length,
        ...(quebra ? { quebraEm: quebra.sequencia } : {}),
      };
    },
  };
}

export type RepositorioAuditoria = ReturnType<typeof repositorioAuditoria>;
