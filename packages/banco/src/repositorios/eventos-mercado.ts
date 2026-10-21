import type { EventoMercadoDTO, NovoEventoMercadoDTO } from "@zentrade/contratos";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { comoUsuario, type Db, type Tx } from "../cliente.js";
import { ms } from "../conversao.js";
import { codigoPostgres, ErroDados, umaLinha, VIOLACAO_UNICA } from "../erros.js";
import { eventosMercado } from "../esquema/index.js";
import { auditar } from "./auditoria.js";

type Linha = typeof eventosMercado.$inferSelect;

export function eventoDeLinha(l: Linha): EventoMercadoDTO {
  return {
    id: l.id,
    data: l.data,
    mercado: l.mercado,
    titulo: l.titulo,
    impacto: l.impacto,
    origem: l.origem,
    de: l.de,
    ate: l.ate,
    criadoEm: ms(l.criadoEm),
  };
}

const valores = (usuarioId: string, e: NovoEventoMercadoDTO, origem: "manual" | "sugerido") => ({
  usuarioId,
  data: e.data,
  mercado: e.mercado,
  titulo: e.titulo.trim(),
  impacto: e.impacto,
  origem,
  de: e.de ?? null,
  ate: e.ate ?? null,
});

/**
 * Agenda de eventos de mercado da pessoa, sempre sob RLS: a pessoa só vê e mexe nos
 * seus. O mesmo evento (dia, mercado e título) não entra duas vezes.
 */
export function repositorioEventosMercado(db: Db) {
  async function inserir(
    tx: Tx,
    usuarioId: string,
    e: NovoEventoMercadoDTO,
    origem: "manual" | "sugerido",
  ): Promise<EventoMercadoDTO> {
    const linha = umaLinha(
      await tx
        .insert(eventosMercado)
        .values(valores(usuarioId, e, origem))
        .returning(),
    );
    await auditar(tx, usuarioId, "evento_mercado_criado", linha.id, {
      data: e.data,
      mercado: e.mercado,
      titulo: e.titulo,
      origem,
    });
    return eventoDeLinha(linha);
  }

  return {
    /** Os eventos entre as duas datas (AAAA-MM-DD, inclusivo), do mais antigo ao mais novo. */
    listar: (usuarioId: string, de: string, ate: string): Promise<EventoMercadoDTO[]> =>
      comoUsuario(db, usuarioId, async (tx) =>
        (
          await tx
            .select()
            .from(eventosMercado)
            .where(and(gte(eventosMercado.data, de), lte(eventosMercado.data, ate)))
            .orderBy(asc(eventosMercado.data), asc(eventosMercado.titulo))
        ).map(eventoDeLinha),
      ),

    async criar(usuarioId: string, e: NovoEventoMercadoDTO): Promise<EventoMercadoDTO> {
      try {
        return await comoUsuario(db, usuarioId, (tx) => inserir(tx, usuarioId, e, "manual"));
      } catch (erro) {
        if (codigoPostgres(erro) === VIOLACAO_UNICA)
          throw new ErroDados(
            "conflito",
            `já existe um evento "${e.titulo.trim()}" em ${e.data} para este mercado; remova o antigo ou mude o título`,
          );
        throw erro;
      }
    },

    /** Grava as sugestões do Claude como `sugerido`; as que já existem são ignoradas. Devolve só as novas. */
    criarSugeridos: (
      usuarioId: string,
      eventos: readonly NovoEventoMercadoDTO[],
    ): Promise<EventoMercadoDTO[]> =>
      comoUsuario(db, usuarioId, async (tx) => {
        const novos: EventoMercadoDTO[] = [];
        for (const e of eventos) {
          const [linha] = await tx
            .insert(eventosMercado)
            .values(valores(usuarioId, e, "sugerido"))
            .onConflictDoNothing()
            .returning();
          if (!linha) continue;
          await auditar(tx, usuarioId, "evento_mercado_criado", linha.id, {
            data: e.data,
            mercado: e.mercado,
            titulo: e.titulo,
            origem: "sugerido",
          });
          novos.push(eventoDeLinha(linha));
        }
        return novos;
      }),

    /** A pessoa confirma uma sugestão: ela passa a valer como cadastro manual. */
    confirmar: (usuarioId: string, id: string): Promise<EventoMercadoDTO | null> =>
      comoUsuario(db, usuarioId, async (tx) => {
        const [linha] = await tx
          .update(eventosMercado)
          .set({ origem: "manual" })
          .where(eq(eventosMercado.id, id))
          .returning();
        if (!linha) return null;
        await auditar(tx, usuarioId, "evento_mercado_confirmado", id);
        return eventoDeLinha(linha);
      }),

    remover: (usuarioId: string, id: string): Promise<boolean> =>
      comoUsuario(db, usuarioId, async (tx) => {
        const [linha] = await tx.delete(eventosMercado).where(eq(eventosMercado.id, id)).returning();
        if (!linha) return false;
        await auditar(tx, usuarioId, "evento_mercado_removido", id, {
          data: linha.data,
          titulo: linha.titulo,
        });
        return true;
      }),
  };
}

export type RepositorioEventosMercado = ReturnType<typeof repositorioEventosMercado>;
