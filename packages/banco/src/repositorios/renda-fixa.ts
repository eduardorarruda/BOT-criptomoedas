import type { NovoTitulo, SerieIndicador } from "@zentrade/contratos";
import { and, asc, eq, gte, sql } from "drizzle-orm";
import { comoUsuario, type Db, type Tx } from "../cliente.js";
import { decimalOpcional, decimalTexto, ms } from "../conversao.js";
import { ErroDados, umaLinha } from "../erros.js";
import { indicadores, indicadoresAtualizacao, titulosRendaFixa } from "../esquema/index.js";
import { auditar } from "./auditoria.js";

type LinhaBanco = typeof titulosRendaFixa.$inferSelect;

/** Título como a API lê: decimais em texto normalizado, datas "AAAA-MM-DD". */
export interface LinhaTitulo {
  readonly id: string;
  readonly origem: LinhaBanco["origem"];
  readonly itemId: string | null;
  readonly grupo: string | null;
  readonly tipo: LinhaBanco["tipo"];
  readonly nome: string;
  readonly emissor: string | null;
  readonly indexador: LinhaBanco["indexador"];
  readonly percentualIndexador: string | null;
  readonly taxaAnual: string | null;
  readonly dataAplicacao: string;
  readonly vencimento: string | null;
  readonly carenciaAte: string | null;
  readonly valorAplicado: string;
  readonly liquidez: LinhaBanco["liquidez"];
  readonly informado: {
    readonly em: string;
    readonly bruto: string;
    readonly liquido: string | null;
    readonly ir: string | null;
    readonly iof: string | null;
  } | null;
  readonly situacao: LinhaBanco["situacao"];
  readonly atualizadoEm: number;
}

const nulo = (v: string | null | undefined): string | null => decimalOpcional(v ?? null) ?? null;

export function tituloDeLinha(l: LinhaBanco): LinhaTitulo {
  return {
    id: l.id,
    origem: l.origem,
    itemId: l.itemId,
    grupo: l.grupo,
    tipo: l.tipo,
    nome: l.nome,
    emissor: l.emissor,
    indexador: l.indexador,
    percentualIndexador: nulo(l.percentualIndexador),
    taxaAnual: nulo(l.taxaAnual),
    dataAplicacao: l.dataAplicacao,
    vencimento: l.vencimento,
    carenciaAte: l.carenciaAte,
    valorAplicado: decimalTexto(l.valorAplicado),
    liquidez: l.liquidez,
    informado:
      l.informadoEm !== null && l.brutoInformado !== null
        ? {
            em: l.informadoEm,
            bruto: decimalTexto(l.brutoInformado),
            liquido: nulo(l.liquidoInformado),
            ir: nulo(l.irInformado),
            iof: nulo(l.iofInformado),
          }
        : null,
    situacao: l.situacao,
    atualizadoEm: ms(l.atualizadoEm),
  };
}

const camposManuais = (t: NovoTitulo) => ({
  tipo: t.tipo,
  nome: t.nome,
  emissor: t.emissor ?? null,
  indexador: t.indexador,
  percentualIndexador: t.percentualIndexador ?? null,
  taxaAnual: t.taxaAnual ?? null,
  dataAplicacao: t.dataAplicacao,
  vencimento: t.vencimento ?? null,
  carenciaAte: t.carenciaAte ?? null,
  valorAplicado: t.valorAplicado,
  liquidez: t.liquidez,
});

async function exigirManual(tx: Tx, id: string): Promise<LinhaBanco | null> {
  const [atual] = await tx.select().from(titulosRendaFixa).where(eq(titulosRendaFixa.id, id));
  if (atual && atual.origem !== "manual") {
    throw new ErroDados(
      "estado_invalido",
      "este título vem da Pluggy e é atualizado pela sincronização; para tirá-lo daqui, remova a conexão",
    );
  }
  return atual ?? null;
}

export function repositorioRendaFixa(db: Db) {
  return {
    listar: (usuarioId: string, incluirEncerrados = false): Promise<LinhaTitulo[]> =>
      comoUsuario(db, usuarioId, async (tx) =>
        (
          await tx
            .select()
            .from(titulosRendaFixa)
            .where(incluirEncerrados ? undefined : eq(titulosRendaFixa.situacao, "ativo"))
            .orderBy(asc(titulosRendaFixa.dataAplicacao), asc(titulosRendaFixa.criadoEm))
        ).map(tituloDeLinha),
      ),

    obter: (usuarioId: string, id: string): Promise<LinhaTitulo | null> =>
      comoUsuario(db, usuarioId, async (tx) => {
        const [l] = await tx.select().from(titulosRendaFixa).where(eq(titulosRendaFixa.id, id));
        return l ? tituloDeLinha(l) : null;
      }),

    criar: (usuarioId: string, t: NovoTitulo): Promise<LinhaTitulo> =>
      comoUsuario(db, usuarioId, async (tx) => {
        const linha = umaLinha(
          await tx
            .insert(titulosRendaFixa)
            .values({ usuarioId, origem: "manual", ...camposManuais(t) })
            .returning(),
        );
        await auditar(tx, usuarioId, "titulo_renda_fixa_cadastrado", linha.id, { tipo: t.tipo });
        return tituloDeLinha(linha);
      }),

    /** Troca os campos de um título manual (o corpo já vem completo e validado). */
    atualizar: (usuarioId: string, id: string, t: NovoTitulo): Promise<LinhaTitulo | null> =>
      comoUsuario(db, usuarioId, async (tx) => {
        if (!(await exigirManual(tx, id))) return null;
        const [linha] = await tx
          .update(titulosRendaFixa)
          .set({ ...camposManuais(t), atualizadoEm: sql`now()` })
          .where(eq(titulosRendaFixa.id, id))
          .returning();
        if (linha) await auditar(tx, usuarioId, "titulo_renda_fixa_alterado", id);
        return linha ? tituloDeLinha(linha) : null;
      }),

    remover: (usuarioId: string, id: string): Promise<boolean> =>
      comoUsuario(db, usuarioId, async (tx) => {
        if (!(await exigirManual(tx, id))) return false;
        const removidos = await tx
          .delete(titulosRendaFixa)
          .where(eq(titulosRendaFixa.id, id))
          .returning({ id: titulosRendaFixa.id });
        if (removidos.length > 0) await auditar(tx, usuarioId, "titulo_renda_fixa_removido", id);
        return removidos.length > 0;
      }),
  };
}

export interface PontoIndicador {
  readonly dia: string;
  readonly valor: string;
  readonly diaFim?: string | null;
}

export interface EstadoIndicador {
  readonly serie: SerieIndicador;
  readonly verificadoEm: number;
  readonly ultimoDia: string | null;
  readonly erro: string | null;
}

const LOTE = 1000;

/** Cache das séries do Banco Central. Acesso de sistema: os dados são públicos e iguais para todos. */
export function repositorioIndicadores(db: Db) {
  return {
    async gravar(serie: SerieIndicador, pontos: readonly PontoIndicador[]): Promise<number> {
      for (let i = 0; i < pontos.length; i += LOTE) {
        const lote = pontos
          .slice(i, i + LOTE)
          .map((p) => ({ serie, dia: p.dia, valor: p.valor, diaFim: p.diaFim ?? null }));
        await db
          .insert(indicadores)
          .values(lote)
          .onConflictDoUpdate({
            target: [indicadores.serie, indicadores.dia],
            set: { valor: sql`excluded.valor`, diaFim: sql`excluded.dia_fim` },
          });
      }
      return pontos.length;
    },

    async registrarVerificacao(serie: SerieIndicador, em: Date, erro: string | null): Promise<void> {
      const [u] = await db
        .select({ ultimo: sql<string | null>`max(${indicadores.dia})::text` })
        .from(indicadores)
        .where(eq(indicadores.serie, serie));
      const valores = { verificadoEm: em, ultimoDia: u?.ultimo ?? null, erro };
      await db
        .insert(indicadoresAtualizacao)
        .values({ serie, ...valores })
        .onConflictDoUpdate({ target: indicadoresAtualizacao.serie, set: valores });
    },

    async ler(serie: SerieIndicador, desde?: string): Promise<PontoIndicador[]> {
      const filtro = desde
        ? and(eq(indicadores.serie, serie), gte(indicadores.dia, desde))
        : eq(indicadores.serie, serie);
      const linhas = await db.select().from(indicadores).where(filtro).orderBy(asc(indicadores.dia));
      return linhas.map((l) => ({ dia: l.dia, valor: decimalTexto(l.valor), diaFim: l.diaFim }));
    },

    async estado(): Promise<EstadoIndicador[]> {
      const linhas = await db
        .select()
        .from(indicadoresAtualizacao)
        .orderBy(asc(indicadoresAtualizacao.serie));
      return linhas.map((l) => ({
        serie: l.serie,
        verificadoEm: ms(l.verificadoEm),
        ultimoDia: l.ultimoDia,
        erro: l.erro,
      }));
    },
  };
}

export type RepositorioRendaFixa = ReturnType<typeof repositorioRendaFixa>;
export type RepositorioIndicadores = ReturnType<typeof repositorioIndicadores>;
