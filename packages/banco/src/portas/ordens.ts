import type { NovaOrdem, OrdemPendente, PortaOrdens, ResultadoOrdem } from "@zentrade/contratos";
import { dec, paraTexto, type Execucao, type Valor } from "@zentrade/dominio";
import { and, asc, count, eq, gte, sql } from "drizzle-orm";
import { resultadoDesde, ultimaPerdaEm } from "../calculos.js";
import type { Db } from "../cliente.js";
import { ErroDados } from "../erros.js";
import { execucoes, ordens, robos } from "../esquema/index.js";
import { execucoesDoRobo } from "../repositorios/execucoes.js";

export function portaOrdens(db: Db): PortaOrdens {
  return {
    /**
     * Grava a intenção ANTES de enviar à corretora. ON CONFLICT no id_cliente: se dois
     * processos tentarem a mesma ordem, só um recebe "nova" — o outro não reenvia.
     */
    async reservar(o: NovaOrdem): Promise<"nova" | "ja_existe"> {
      const inseridas = await db.execute<{ id: string }>(sql`
        insert into ordens (usuario_id, robo_id, decisao_id, id_cliente, simbolo, lado, quantidade)
        select r.usuario_id, r.id, ${o.decisaoId}, ${o.idCliente}, ${o.simbolo}, ${o.lado}, ${paraTexto(o.quantidade)}::numeric
        from ${robos} r where r.id = ${o.roboId}
        on conflict (id_cliente) do nothing
        returning id`);
      if (inseridas.length > 0) return "nova";
      const [existente] = await db
        .select({ id: ordens.id })
        .from(ordens)
        .where(eq(ordens.idCliente, o.idCliente));
      if (existente) return "ja_existe";
      throw new ErroDados("nao_encontrado", `o robô ${o.roboId} não existe; a ordem não foi reservada`);
    },

    /** Grava o desfecho. As execuções entram por posição na lista: reconcluir não duplica. */
    async concluir(idCliente: string, r: ResultadoOrdem): Promise<void> {
      await db.transaction(async (tx) => {
        const [ordem] = await tx
          .update(ordens)
          .set({
            estado: r.estado,
            idCorretora: r.idCorretora,
            motivo: r.motivo ?? null,
            atualizadaEm: new Date(),
          })
          .where(eq(ordens.idCliente, idCliente))
          .returning({ id: ordens.id, usuarioId: ordens.usuarioId });
        if (!ordem) {
          throw new ErroDados(
            "nao_encontrado",
            `a ordem ${idCliente} não foi reservada; reserve antes de concluir`,
          );
        }
        if (r.execucoes.length === 0) return;
        await tx
          .insert(execucoes)
          .values(r.execucoes.map((e, sequencia) => linhaExecucao(ordem, sequencia, e)))
          .onConflictDoNothing({ target: [execucoes.ordemId, execucoes.sequencia] });
      });
    },

    async pendentes(roboId: string): Promise<OrdemPendente[]> {
      const linhas = await db
        .select()
        .from(ordens)
        .where(and(eq(ordens.roboId, roboId), eq(ordens.estado, "PENDENTE")))
        .orderBy(asc(ordens.criadaEm), asc(ordens.idCliente));
      return linhas.map((o) => ({
        idCliente: o.idCliente,
        decisaoId: o.decisaoId,
        lado: o.lado,
        quantidade: dec(o.quantidade),
        criadaEm: o.criadaEm.getTime(),
      }));
    },

    execucoes: (roboId: string): Promise<Execucao[]> => execucoesDoRobo(db, roboId),

    async contarDesde(roboId: string, desdeMs: number): Promise<number> {
      const [r] = await db
        .select({ n: count() })
        .from(ordens)
        .where(and(eq(ordens.roboId, roboId), gte(ordens.criadaEm, new Date(desdeMs))));
      return r?.n ?? 0;
    },

    async resultadoDesde(roboId: string, desdeMs: number): Promise<Valor> {
      return resultadoDesde(await execucoesDoRobo(db, roboId), desdeMs);
    },

    async ultimaPerdaEm(roboId: string): Promise<number | null> {
      return ultimaPerdaEm(await execucoesDoRobo(db, roboId));
    },
  };
}

export function linhaExecucao(ordem: { id: string; usuarioId: string }, sequencia: number, e: Execucao) {
  return {
    usuarioId: ordem.usuarioId,
    ordemId: ordem.id,
    sequencia,
    preco: paraTexto(e.preco),
    quantidade: paraTexto(e.quantidade),
    taxaCotacao: paraTexto(e.taxaCotacao),
    em: new Date(e.em),
  };
}
