import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { usuarios } from "./acesso.js";
import { decimal, instante } from "./tipos.js";

const INTERVALOS = ["1m", "5m", "15m", "1h", "4h", "1d"] as const;
const intervalos = sql.raw(INTERVALOS.map((i) => `'${i}'`).join(", "));

// As chaves estrangeiras levam usuario_id junto: a checagem de FK não passa pelo RLS,
// então sem isso alguém conseguiria apontar o próprio robô para a estratégia de outra pessoa.
const usuarioId = () =>
  uuid("usuario_id")
    .notNull()
    .references(() => usuarios.id, { onDelete: "cascade" });

export const estrategias = pgTable(
  "estrategias",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    usuarioId: usuarioId(),
    nome: text("nome").notNull(),
    versaoAtual: integer("versao_atual").notNull().default(1),
    criadaEm: instante("criada_em").notNull().defaultNow(),
  },
  (t) => [unique("estrategias_id_usuario").on(t.id, t.usuarioId)],
);

/** Versões são imutáveis (gatilho barra UPDATE e DELETE): robô e backtest apontam para uma versão exata. */
export const estrategiaVersoes = pgTable(
  "estrategia_versoes",
  {
    estrategiaId: uuid("estrategia_id").notNull(),
    versao: integer("versao").notNull(),
    usuarioId: usuarioId(),
    nome: text("nome").notNull(),
    /**
     * { entrada, saida?, stopAtr?, stopMovel?, empate?, tempoMaximo?, tamanhoPorVolatilidade? }:
     * validados com EstrategiaEsquema e validarEstrategia antes de gravar (veja RegraGravada).
     */
    regra: jsonb("regra").notNull(),
    stop: decimal("stop").notNull(),
    alvoLiquido: decimal("alvo_liquido").notNull(),
    taxa: decimal("taxa").notNull(),
    criadaEm: instante("criada_em").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ name: "estrategia_versoes_pk", columns: [t.estrategiaId, t.versao] }),
    unique("estrategia_versoes_id_usuario").on(t.estrategiaId, t.versao, t.usuarioId),
    foreignKey({
      name: "estrategia_versoes_estrategia_fk",
      columns: [t.estrategiaId, t.usuarioId],
      foreignColumns: [estrategias.id, estrategias.usuarioId],
    }).onDelete("restrict"),
  ],
);

export const robos = pgTable(
  "robos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    usuarioId: usuarioId(),
    nome: text("nome").notNull(),
    simbolo: text("simbolo").notNull(),
    intervalo: text("intervalo", { enum: INTERVALOS }).notNull(),
    modo: text("modo", { enum: ["observar", "sugerir", "auto"] })
      .notNull()
      .default("observar"),
    rede: text("rede", { enum: ["papel", "testnet", "real"] }).notNull(),
    estrategiaId: uuid("estrategia_id").notNull(),
    estrategiaVersao: integer("estrategia_versao").notNull(),
    perdaDiariaMaxima: decimal("perda_diaria_maxima").notNull(),
    exposicaoMaxima: decimal("exposicao_maxima").notNull(),
    riscoPorOperacao: decimal("risco_por_operacao").notNull(),
    ordensPorHoraMax: integer("ordens_por_hora_max").notNull(),
    pausaAposPerdaMin: integer("pausa_apos_perda_min").notNull(),
    confiancaMinima: decimal("confianca_minima").notNull(),
    pausado: boolean("pausado").notNull().default(false),
    criadoEm: instante("criado_em").notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "robos_estrategia_versao_fk",
      columns: [t.estrategiaId, t.estrategiaVersao, t.usuarioId],
      foreignColumns: [estrategiaVersoes.estrategiaId, estrategiaVersoes.versao, estrategiaVersoes.usuarioId],
    }),
    unique("robos_id_usuario").on(t.id, t.usuarioId),
    index("robos_usuario").on(t.usuarioId),
    check("robos_intervalo", sql`${t.intervalo} in (${intervalos})`),
    check("robos_modo", sql`${t.modo} in ('observar', 'sugerir', 'auto')`),
    check("robos_rede", sql`${t.rede} in ('papel', 'testnet', 'real')`),
  ],
);

export const ESTADOS_DECISAO = [
  "registrada",
  "barrada",
  "aguardando_aprovacao",
  "aprovada",
  "recusada",
  "expirada",
  "executada",
  "falhou",
] as const;

export const decisoes = pgTable(
  "decisoes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    usuarioId: usuarioId(),
    roboId: uuid("robo_id").notNull(),
    em: instante("em").notNull(),
    sinal: jsonb("sinal").notNull(),
    proposta: jsonb("proposta"),
    quantidade: decimal("quantidade"),
    preco: decimal("preco").notNull(),
    risco: jsonb("risco").notNull(),
    estado: text("estado", { enum: ESTADOS_DECISAO }).notNull(),
    custoIaUsd: decimal("custo_ia_usd"),
    /** Só para `aguardando_aprovacao`: depois disto a aprovação não vale mais. */
    expiraEm: instante("expira_em"),
    decididaPor: text("decidida_por"),
    /** Compra: stop e alvo efetivos (regra ou agente, o mais conservador), para a posição sobreviver a reinício. */
    stopEfetivo: decimal("stop_efetivo"),
    alvoEfetivo: decimal("alvo_efetivo"),
    resultado: decimal("resultado"),
    avaliadaEm: instante("avaliada_em"),
    atualizadaEm: instante("atualizada_em").notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "decisoes_robo_fk",
      columns: [t.roboId, t.usuarioId],
      foreignColumns: [robos.id, robos.usuarioId],
    }).onDelete("cascade"),
    unique("decisoes_id_usuario").on(t.id, t.usuarioId),
    index("decisoes_usuario_em").on(t.usuarioId, t.em.desc()),
    index("decisoes_robo_em").on(t.roboId, t.em.desc()),
    check("decisoes_estado", sql.raw(`estado in (${ESTADOS_DECISAO.map((e) => `'${e}'`).join(", ")})`)),
  ],
);

export const ordens = pgTable(
  "ordens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    usuarioId: usuarioId(),
    roboId: uuid("robo_id").notNull(),
    decisaoId: uuid("decisao_id").notNull(),
    /** Idempotência com a corretora: a mesma intenção nunca vira duas ordens. */
    idCliente: text("id_cliente").notNull(),
    idCorretora: text("id_corretora"),
    simbolo: text("simbolo").notNull(),
    lado: text("lado", { enum: ["COMPRA", "VENDA"] }).notNull(),
    quantidade: decimal("quantidade").notNull(),
    estado: text("estado", { enum: ["PENDENTE", "PARCIAL", "PREENCHIDA", "REJEITADA", "CANCELADA"] })
      .notNull()
      .default("PENDENTE"),
    motivo: text("motivo"),
    criadaEm: instante("criada_em").notNull().defaultNow(),
    atualizadaEm: instante("atualizada_em").notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "ordens_robo_fk",
      columns: [t.roboId, t.usuarioId],
      foreignColumns: [robos.id, robos.usuarioId],
    }).onDelete("cascade"),
    foreignKey({
      name: "ordens_decisao_fk",
      columns: [t.decisaoId, t.usuarioId],
      foreignColumns: [decisoes.id, decisoes.usuarioId],
    }).onDelete("cascade"),
    unique("ordens_id_usuario").on(t.id, t.usuarioId),
    unique("ordens_id_cliente_unico").on(t.idCliente),
    index("ordens_robo_criada").on(t.roboId, t.criadaEm.desc()),
    check("ordens_lado", sql`${t.lado} in ('COMPRA', 'VENDA')`),
    check(
      "ordens_estado",
      sql`${t.estado} in ('PENDENTE', 'PARCIAL', 'PREENCHIDA', 'REJEITADA', 'CANCELADA')`,
    ),
  ],
);

/** Execuções confirmadas pela corretora: a fonte da posição (que não é gravada). */
export const execucoes = pgTable(
  "execucoes",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    usuarioId: usuarioId(),
    ordemId: uuid("ordem_id").notNull(),
    /** Posição da execução na lista da corretora: reconcluir a ordem não duplica execução. */
    sequencia: integer("sequencia").notNull(),
    preco: decimal("preco").notNull(),
    quantidade: decimal("quantidade").notNull(),
    taxaCotacao: decimal("taxa_cotacao").notNull(),
    em: instante("em").notNull(),
  },
  (t) => [
    foreignKey({
      name: "execucoes_ordem_fk",
      columns: [t.ordemId, t.usuarioId],
      foreignColumns: [ordens.id, ordens.usuarioId],
    }).onDelete("cascade"),
    unique("execucoes_ordem_sequencia").on(t.ordemId, t.sequencia),
    check("execucoes_quantidade_positiva", sql`${t.quantidade} > 0`),
  ],
);

export const backtests = pgTable(
  "backtests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    usuarioId: usuarioId(),
    estrategiaId: uuid("estrategia_id").notNull(),
    estrategiaVersao: integer("estrategia_versao").notNull(),
    simbolo: text("simbolo").notNull(),
    intervalo: text("intervalo", { enum: INTERVALOS }).notNull(),
    inicio: instante("inicio").notNull(),
    fim: instante("fim").notNull(),
    estado: text("estado", { enum: ["na_fila", "rodando", "concluido", "falhou"] })
      .notNull()
      .default("na_fila"),
    metricas: jsonb("metricas"),
    curva: jsonb("curva"),
    erro: text("erro"),
    criadoEm: instante("criado_em").notNull().defaultNow(),
    concluidoEm: instante("concluido_em"),
  },
  (t) => [
    foreignKey({
      name: "backtests_estrategia_versao_fk",
      columns: [t.estrategiaId, t.estrategiaVersao, t.usuarioId],
      foreignColumns: [estrategiaVersoes.estrategiaId, estrategiaVersoes.versao, estrategiaVersoes.usuarioId],
    }),
    index("backtests_usuario").on(t.usuarioId, t.criadoEm.desc()),
    check("backtests_estado", sql`${t.estado} in ('na_fila', 'rodando', 'concluido', 'falhou')`),
    check("backtests_periodo", sql`${t.fim} > ${t.inicio}`),
  ],
);
