import type { Execucao } from "@zentrade/dominio";
import { asc, eq } from "drizzle-orm";
import type { Executor } from "../cliente.js";
import { execucaoDeLinha } from "../conversao.js";
import { execucoes, ordens } from "../esquema/index.js";

/** Execuções do robô na ordem em que aconteceram — a entrada de posicaoDe. */
export async function execucoesDoRobo(executor: Executor, roboId: string): Promise<Execucao[]> {
  const linhas = await executor
    .select({ lado: ordens.lado, e: execucoes })
    .from(execucoes)
    .innerJoin(ordens, eq(ordens.id, execucoes.ordemId))
    .where(eq(ordens.roboId, roboId))
    .orderBy(asc(execucoes.em), asc(execucoes.id));
  return linhas.map((l) => execucaoDeLinha(l.lado, l.e));
}

/** Execuções de todos os robôs que o executor enxerga, agrupadas por robô. */
export async function execucoesPorRobo(executor: Executor): Promise<Map<string, Execucao[]>> {
  const linhas = await executor
    .select({ roboId: ordens.roboId, lado: ordens.lado, e: execucoes })
    .from(execucoes)
    .innerJoin(ordens, eq(ordens.id, execucoes.ordemId))
    .orderBy(asc(execucoes.em), asc(execucoes.id));
  const porRobo = new Map<string, Execucao[]>();
  for (const l of linhas) {
    const lista = porRobo.get(l.roboId) ?? [];
    lista.push(execucaoDeLinha(l.lado, l.e));
    porRobo.set(l.roboId, lista);
  }
  return porRobo;
}
