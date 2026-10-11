import { INDEXADORES, LIQUIDEZES, ORIGENS_TITULO, SERIES_INDICADOR, TIPOS_TITULO } from "@zentrade/contratos";
import { sql } from "drizzle-orm";
import {
  check,
  date,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { usuarios } from "./acesso.js";
import { decimal, instante } from "./tipos.js";

const lista = (valores: readonly string[]) => sql.raw(valores.map((v) => `'${v}'`).join(", "));
/** Data de calendário: o driver devolve "AAAA-MM-DD", sem fuso. */
const dia = (nome: string) => date(nome, { mode: "string" });

/**
 * Séries do Banco Central (SGS): iguais para todos, sem usuario_id nem RLS. Servem
 * de cache: a API atualiza uma vez por dia e as contas leem daqui, nunca da rede.
 */
export const indicadores = pgTable(
  "indicadores",
  {
    serie: text("serie", { enum: SERIES_INDICADOR }).notNull(),
    dia: dia("dia").notNull(),
    /** Como o BCB publica: % ao dia (CDI, Selic), % no mês (IPCA), % no período (poupança, TR), % ao ano (meta). */
    valor: decimal("valor").notNull(),
    /** Fim do período (poupança e TR). */
    diaFim: dia("dia_fim"),
  },
  (t) => [
    primaryKey({ name: "indicadores_pk", columns: [t.serie, t.dia] }),
    check("indicadores_serie", sql`${t.serie} in (${lista(SERIES_INDICADOR)})`),
  ],
);

export const indicadoresAtualizacao = pgTable("indicadores_atualizacao", {
  serie: text("serie", { enum: SERIES_INDICADOR }).primaryKey(),
  verificadoEm: instante("verificado_em").notNull(),
  ultimoDia: dia("ultimo_dia"),
  erro: text("erro"),
});

const usuarioId = () =>
  uuid("usuario_id")
    .notNull()
    .references(() => usuarios.id, { onDelete: "cascade" });

/** Conexões da Pluggy (itens) de cada pessoa. O id é o do item na Pluggy. */
export const pluggyItens = pgTable(
  "pluggy_itens",
  {
    id: text("id").primaryKey(),
    usuarioId: usuarioId(),
    instituicao: text("instituicao").notNull(),
    conectorId: integer("conector_id"),
    logoUrl: text("logo_url"),
    situacao: text("situacao").notNull(),
    erro: text("erro"),
    atualizadoNoBanco: instante("atualizado_no_banco"),
    consentimentoExpira: instante("consentimento_expira"),
    ultimaSincronizacao: instante("ultima_sincronizacao"),
    erroSincronizacao: text("erro_sincronizacao"),
    criadoEm: instante("criado_em").notNull().defaultNow(),
  },
  (t) => [
    unique("pluggy_itens_id_usuario").on(t.id, t.usuarioId),
    index("pluggy_itens_usuario").on(t.usuarioId),
  ],
);

export const titulosRendaFixa = pgTable(
  "titulos_renda_fixa",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    usuarioId: usuarioId(),
    origem: text("origem", { enum: ORIGENS_TITULO }).notNull(),
    itemId: text("item_id"),
    /** Id do investimento na Pluggy: a sincronização atualiza a mesma linha. */
    externoId: text("externo_id"),
    grupo: text("grupo"),
    tipo: text("tipo", { enum: TIPOS_TITULO }).notNull(),
    nome: text("nome").notNull(),
    emissor: text("emissor"),
    emissorCnpj: text("emissor_cnpj"),
    indexador: text("indexador", { enum: INDEXADORES }).notNull(),
    percentualIndexador: decimal("percentual_indexador"),
    taxaAnual: decimal("taxa_anual"),
    dataAplicacao: dia("data_aplicacao").notNull(),
    vencimento: dia("vencimento"),
    carenciaAte: dia("carencia_ate"),
    valorAplicado: decimal("valor_aplicado").notNull(),
    liquidez: text("liquidez", { enum: LIQUIDEZES }).notNull(),
    informadoEm: dia("informado_em"),
    brutoInformado: decimal("bruto_informado"),
    liquidoInformado: decimal("liquido_informado"),
    irInformado: decimal("ir_informado"),
    iofInformado: decimal("iof_informado"),
    situacao: text("situacao", { enum: ["ativo", "encerrado"] })
      .notNull()
      .default("ativo"),
    criadoEm: instante("criado_em").notNull().defaultNow(),
    atualizadoEm: instante("atualizado_em").notNull().defaultNow(),
  },
  (t) => [
    // Com usuario_id: a FK não passa pelo RLS, e ninguém pendura título no item de outra pessoa.
    foreignKey({
      name: "titulos_renda_fixa_item_fk",
      columns: [t.itemId, t.usuarioId],
      foreignColumns: [pluggyItens.id, pluggyItens.usuarioId],
    }).onDelete("cascade"),
    unique("titulos_renda_fixa_externo").on(t.usuarioId, t.externoId),
    index("titulos_renda_fixa_usuario").on(t.usuarioId, t.situacao),
    check("titulos_renda_fixa_origem", sql`${t.origem} in (${lista(ORIGENS_TITULO)})`),
    check("titulos_renda_fixa_tipo", sql`${t.tipo} in (${lista(TIPOS_TITULO)})`),
    check("titulos_renda_fixa_indexador", sql`${t.indexador} in (${lista(INDEXADORES)})`),
    check("titulos_renda_fixa_liquidez", sql`${t.liquidez} in (${lista(LIQUIDEZES)})`),
    check("titulos_renda_fixa_situacao", sql`${t.situacao} in ('ativo', 'encerrado')`),
    check("titulos_renda_fixa_valor", sql`${t.valorAplicado} >= 0`),
  ],
);
