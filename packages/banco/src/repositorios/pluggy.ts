import { and, asc, eq, notInArray, sql } from "drizzle-orm";
import { comoUsuario, type Db, type Tx } from "../cliente.js";
import { ms } from "../conversao.js";
import { ErroDados } from "../erros.js";
import { pluggyItens, titulosRendaFixa } from "../esquema/index.js";
import { auditar } from "./auditoria.js";

type Titulo = typeof titulosRendaFixa.$inferInsert;

/** Item (conexão) da Pluggy de uma pessoa. */
export interface ItemPluggyLinha {
  readonly id: string;
  readonly instituicao: string;
  readonly logoUrl: string | null;
  readonly situacao: string;
  readonly erro: string | null;
  readonly atualizadoNoBanco: number | null;
  readonly consentimentoExpira: number | null;
  readonly ultimaSincronizacao: number | null;
  readonly erroSincronizacao: string | null;
  readonly titulos: number;
  readonly criadoEm: number;
}

export interface DadosItem {
  readonly id: string;
  readonly instituicao: string;
  readonly conectorId: number | null;
  readonly logoUrl: string | null;
  readonly situacao: string;
  readonly erro: string | null;
  readonly atualizadoNoBanco: Date | null;
  readonly consentimentoExpira: Date | null;
}

/** Um investimento já normalizado para o modelo de renda fixa. Decimais em texto. */
export interface TituloSincronizado {
  readonly externoId: string;
  readonly grupo: string | null;
  readonly tipo: Titulo["tipo"];
  readonly nome: string;
  readonly emissor: string | null;
  readonly emissorCnpj: string | null;
  readonly indexador: Titulo["indexador"];
  readonly percentualIndexador: string | null;
  readonly taxaAnual: string | null;
  readonly dataAplicacao: string;
  readonly vencimento: string | null;
  readonly valorAplicado: string;
  readonly liquidez: Titulo["liquidez"];
  readonly informadoEm: string;
  readonly bruto: string;
  readonly liquido: string | null;
  readonly ir: string | null;
  readonly iof: string | null;
}

export interface ContagemSincronizacao {
  readonly novos: number;
  readonly atualizados: number;
  readonly encerrados: number;
}

const msOuNulo = (d: Date | null): number | null => (d ? ms(d) : null);

async function listarItens(tx: Tx, id?: string): Promise<ItemPluggyLinha[]> {
  const linhas = await tx
    .select({
      item: pluggyItens,
      titulos: sql<number>`(select count(*)::int from titulos_renda_fixa t where t.item_id = pluggy_itens.id and t.situacao = 'ativo')`,
    })
    .from(pluggyItens)
    .where(id ? eq(pluggyItens.id, id) : undefined)
    .orderBy(asc(pluggyItens.criadoEm));
  return linhas.map(({ item: i, titulos }) => ({
    id: i.id,
    instituicao: i.instituicao,
    logoUrl: i.logoUrl,
    situacao: i.situacao,
    erro: i.erro,
    atualizadoNoBanco: msOuNulo(i.atualizadoNoBanco),
    consentimentoExpira: msOuNulo(i.consentimentoExpira),
    ultimaSincronizacao: msOuNulo(i.ultimaSincronizacao),
    erroSincronizacao: i.erroSincronizacao,
    titulos,
    criadoEm: ms(i.criadoEm),
  }));
}

const valoresDoTitulo = (usuarioId: string, itemId: string, t: TituloSincronizado) => ({
  usuarioId,
  origem: "pluggy" as const,
  itemId,
  externoId: t.externoId,
  grupo: t.grupo,
  tipo: t.tipo,
  nome: t.nome,
  emissor: t.emissor,
  emissorCnpj: t.emissorCnpj,
  indexador: t.indexador,
  percentualIndexador: t.percentualIndexador,
  taxaAnual: t.taxaAnual,
  dataAplicacao: t.dataAplicacao,
  vencimento: t.vencimento,
  valorAplicado: t.valorAplicado,
  liquidez: t.liquidez,
  informadoEm: t.informadoEm,
  brutoInformado: t.bruto,
  liquidoInformado: t.liquido,
  irInformado: t.ir,
  iofInformado: t.iof,
  situacao: "ativo" as const,
});

const ATUALIZAVEIS = [
  "grupo",
  "tipo",
  "nome",
  "emissor",
  "emissor_cnpj",
  "indexador",
  "percentual_indexador",
  "taxa_anual",
  "data_aplicacao",
  "vencimento",
  "valor_aplicado",
  "liquidez",
  "informado_em",
  "bruto_informado",
  "liquido_informado",
  "ir_informado",
  "iof_informado",
  "situacao",
  "item_id",
] as const;
const conjuntoAtualizacao = Object.fromEntries([
  ...ATUALIZAVEIS.map((c) => [
    c.replace(/_(\w)/g, (_, l: string) => l.toUpperCase()),
    sql.raw(`excluded.${c}`),
  ]),
  ["atualizadoEm", sql`now()`],
]);

export function repositorioPluggy(db: Db) {
  return {
    listar: (usuarioId: string): Promise<ItemPluggyLinha[]> =>
      comoUsuario(db, usuarioId, (tx) => listarItens(tx)),

    obter: (usuarioId: string, id: string): Promise<ItemPluggyLinha | null> =>
      comoUsuario(db, usuarioId, async (tx) => (await listarItens(tx, id))[0] ?? null),

    /** Grava (ou atualiza) o item da pessoa. Item de outra pessoa é conflito, nunca troca de dono. */
    async registrar(usuarioId: string, d: DadosItem): Promise<void> {
      const [dono] = await db
        .select({ u: pluggyItens.usuarioId })
        .from(pluggyItens)
        .where(eq(pluggyItens.id, d.id));
      if (dono && dono.u !== usuarioId) {
        throw new ErroDados(
          "conflito",
          "esta conexão da Pluggy já está ligada a outra pessoa nesta instalação",
        );
      }
      await comoUsuario(db, usuarioId, async (tx) => {
        await tx
          .insert(pluggyItens)
          .values({ ...d, usuarioId })
          .onConflictDoUpdate({ target: pluggyItens.id, set: { ...d } });
        if (!dono)
          await auditar(tx, usuarioId, "pluggy_item_conectado", d.id, { instituicao: d.instituicao });
      });
    },

    marcarSincronizacao: (usuarioId: string, id: string, em: Date, erro: string | null): Promise<void> =>
      comoUsuario(db, usuarioId, async (tx) => {
        await tx
          .update(pluggyItens)
          .set({ ultimaSincronizacao: em, erroSincronizacao: erro })
          .where(eq(pluggyItens.id, id));
      }),

    /**
     * Grava os títulos vindos da Pluggy numa transação. Só encerra os que sumiram
     * quando `completo` (o item terminou de atualizar): lista parcial nunca apaga nada.
     */
    aplicarSincronizacao: (
      usuarioId: string,
      itemId: string,
      titulos: readonly TituloSincronizado[],
      completo: boolean,
    ): Promise<ContagemSincronizacao> =>
      comoUsuario(db, usuarioId, async (tx) => {
        let novos = 0;
        for (const t of titulos) {
          const [r] = await tx
            .insert(titulosRendaFixa)
            .values(valoresDoTitulo(usuarioId, itemId, t))
            .onConflictDoUpdate({
              target: [titulosRendaFixa.usuarioId, titulosRendaFixa.externoId],
              set: conjuntoAtualizacao,
            })
            .returning({ novo: sql<boolean>`(xmax = 0)` });
          if (r?.novo) novos++;
        }
        let encerrados = 0;
        if (completo) {
          const ids = titulos.map((t) => t.externoId);
          const doItem = and(eq(titulosRendaFixa.itemId, itemId), eq(titulosRendaFixa.situacao, "ativo"));
          const fechados = await tx
            .update(titulosRendaFixa)
            .set({ situacao: "encerrado", atualizadoEm: sql`now()` })
            .where(ids.length > 0 ? and(doItem, notInArray(titulosRendaFixa.externoId, ids)) : doItem)
            .returning({ id: titulosRendaFixa.id });
          encerrados = fechados.length;
        }
        return { novos, atualizados: titulos.length - novos, encerrados };
      }),

    /** Remove a conexão daqui (e os títulos dela). Nunca apaga o item na Pluggy. */
    remover: (usuarioId: string, id: string): Promise<boolean> =>
      comoUsuario(db, usuarioId, async (tx) => {
        const removidos = await tx
          .delete(pluggyItens)
          .where(eq(pluggyItens.id, id))
          .returning({ id: pluggyItens.id });
        if (removidos.length > 0) await auditar(tx, usuarioId, "pluggy_item_removido", id);
        return removidos.length > 0;
      }),

    /** Sistema: todos os itens, para a sincronização periódica. */
    todos: async (): Promise<{ id: string; usuarioId: string }[]> =>
      db
        .select({ id: pluggyItens.id, usuarioId: pluggyItens.usuarioId })
        .from(pluggyItens)
        .orderBy(asc(pluggyItens.criadoEm)),
  };
}

export type RepositorioPluggy = ReturnType<typeof repositorioPluggy>;
