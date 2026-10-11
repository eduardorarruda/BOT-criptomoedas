import type { OrdemDTO } from "@zentrade/contratos";
import { asc, desc, eq, inArray, type SQL } from "drizzle-orm";
import { comoUsuario, type Db, type Executor } from "../cliente.js";
import { ordemDeLinha } from "../conversao.js";
import { execucoes, ordens } from "../esquema/index.js";
import { limitar } from "./lista.js";

/** Ordens (mais recentes primeiro) já com as execuções de cada uma. */
export async function ordensComExecucoes(
  executor: Executor,
  condicao: SQL | undefined,
  limite: number,
): Promise<OrdemDTO[]> {
  const linhas = await executor
    .select()
    .from(ordens)
    .where(condicao)
    .orderBy(desc(ordens.criadaEm))
    .limit(limite);
  if (linhas.length === 0) return [];
  const execs = await executor
    .select()
    .from(execucoes)
    .where(
      inArray(
        execucoes.ordemId,
        linhas.map((o) => o.id),
      ),
    )
    .orderBy(asc(execucoes.sequencia));
  return linhas.map((o) =>
    ordemDeLinha(
      o,
      execs.filter((e) => e.ordemId === o.id),
    ),
  );
}

export function repositorioOrdens(db: Db) {
  return {
    listar: (usuarioId: string, f: { roboId?: string; limite?: number } = {}): Promise<OrdemDTO[]> =>
      comoUsuario(db, usuarioId, (tx) =>
        ordensComExecucoes(tx, f.roboId ? eq(ordens.roboId, f.roboId) : undefined, limitar(f.limite)),
      ),
  };
}

export type RepositorioOrdens = ReturnType<typeof repositorioOrdens>;
