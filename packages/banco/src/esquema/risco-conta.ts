import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { usuarios } from "./acesso.js";
import { decimal, instante } from "./tipos.js";

const usuarioId = () =>
  uuid("usuario_id")
    .notNull()
    .references(() => usuarios.id, { onDelete: "cascade" });

/**
 * Limites da conta e orçamento de IA de cada pessoa (uma linha por pessoa). `null` =
 * sem limite. `liberada_em`: a pessoa liberou as pausas de queda e de sequência de
 * stops à mão; pico e perdas anteriores deixam de contar.
 */
export const limitesConta = pgTable(
  "limites_conta",
  {
    usuarioId: uuid("usuario_id")
      .primaryKey()
      .references(() => usuarios.id, { onDelete: "cascade" }),
    perdaDiariaMaxima: decimal("perda_diaria_maxima"),
    incluirNaoRealizado: boolean("incluir_nao_realizado").notNull().default(false),
    exposicaoMaxima: decimal("exposicao_maxima"),
    posicoesAbertasMax: integer("posicoes_abertas_max"),
    quedaMaxima: decimal("queda_maxima"),
    quedaJanelaHoras: integer("queda_janela_horas").notNull().default(72),
    sequenciaStopsMax: integer("sequencia_stops_max"),
    sequenciaStopsJanelaHoras: integer("sequencia_stops_janela_horas").notNull().default(24),
    sequenciaStopsEscopo: text("sequencia_stops_escopo", { enum: ["robo", "conta", "ambos"] })
      .notNull()
      .default("ambos"),
    orcamentoIaMensalUsd: decimal("orcamento_ia_mensal_usd"),
    orcamentoIaDiarioUsd: decimal("orcamento_ia_diario_usd"),
    liberadaEm: instante("liberada_em"),
    atualizadaEm: instante("atualizada_em").notNull().defaultNow(),
  },
  (t) => [
    check(
      "limites_conta_valores_positivos",
      sql`coalesce(${t.perdaDiariaMaxima}, 1) > 0 and coalesce(${t.exposicaoMaxima}, 1) > 0
        and coalesce(${t.quedaMaxima}, 1) > 0 and coalesce(${t.orcamentoIaMensalUsd}, 1) > 0
        and coalesce(${t.orcamentoIaDiarioUsd}, 1) > 0`,
    ),
    check("limites_conta_posicoes", sql`${t.posicoesAbertasMax} between 1 and 100`),
    check("limites_conta_queda_janela", sql`${t.quedaJanelaHoras} between 1 and 720`),
    check("limites_conta_stops", sql`${t.sequenciaStopsMax} between 1 and 50`),
    check("limites_conta_stops_janela", sql`${t.sequenciaStopsJanelaHoras} between 1 and 168`),
    check("limites_conta_stops_escopo", sql`${t.sequenciaStopsEscopo} in ('robo', 'conta', 'ambos')`),
  ],
);

/**
 * Saldo da corretora abaixo do que os robôs registram (reconciliação). Uma aberta por
 * pessoa, rede e ativo; enquanto aberta, compras desse ativo ficam paradas.
 */
export const divergenciasSaldo = pgTable(
  "divergencias_saldo",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    usuarioId: usuarioId(),
    rede: text("rede", { enum: ["testnet", "real"] }).notNull(),
    ativo: text("ativo").notNull(),
    esperado: decimal("esperado").notNull(),
    naCorretora: decimal("na_corretora").notNull(),
    falta: decimal("falta").notNull(),
    estado: text("estado", { enum: ["aberta", "aceita", "resolvida"] })
      .notNull()
      .default("aberta"),
    detectadaEm: instante("detectada_em").notNull().defaultNow(),
    atualizadaEm: instante("atualizada_em").notNull().defaultNow(),
    resolvidaEm: instante("resolvida_em"),
    resolvidaPor: text("resolvida_por"),
  },
  (t) => [
    uniqueIndex("divergencias_saldo_aberta_unica")
      .on(t.usuarioId, t.rede, t.ativo)
      .where(sql`${t.estado} = 'aberta'`),
    index("divergencias_saldo_usuario").on(t.usuarioId, t.detectadaEm.desc()),
    check("divergencias_saldo_rede", sql`${t.rede} in ('testnet', 'real')`),
    check("divergencias_saldo_estado", sql`${t.estado} in ('aberta', 'aceita', 'resolvida')`),
    check("divergencias_saldo_falta", sql`${t.falta} > 0`),
  ],
);

export const TIPOS_ALERTA = [
  "stop_atingido",
  "perda_diaria_robo",
  "perda_diaria_conta",
  "pausa_sequencia_stops",
  "pausa_queda",
  "ordem_rejeitada",
  "ordem_incerta",
  "robo_nao_ligou",
  "websocket_fora",
  "divergencia_saldo",
  "orcamento_ia_80",
  "orcamento_ia_100",
] as const;

/** Avisos na tela: os alertas que chegaram para a pessoa (já deduplicados). */
export const avisos = pgTable(
  "avisos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    usuarioId: usuarioId(),
    tipo: text("tipo", { enum: TIPOS_ALERTA }).notNull(),
    gravidade: text("gravidade", { enum: ["info", "atencao", "critico"] }).notNull(),
    titulo: text("titulo").notNull(),
    mensagem: text("mensagem").notNull(),
    chave: text("chave").notNull(),
    /** Sem chave estrangeira: o aviso sobrevive ao robô apagado. */
    roboId: uuid("robo_id"),
    criadoEm: instante("criado_em").notNull().defaultNow(),
    lidoEm: instante("lido_em"),
    enviado: boolean("enviado").notNull().default(false),
  },
  (t) => [
    index("avisos_usuario_criado").on(t.usuarioId, t.criadoEm.desc()),
    check("avisos_gravidade", sql`${t.gravidade} in ('info', 'atencao', 'critico')`),
    check("avisos_tipo", sql.raw(`tipo in (${TIPOS_ALERTA.map((x) => `'${x}'`).join(", ")})`)),
  ],
);

/**
 * Livro do gasto com IA (análises e assistente), gravado pelo agente depois de cada
 * chamada ao modelo: é o que o orçamento mensal/diário soma.
 */
export const gastosIa = pgTable(
  "gastos_ia",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    usuarioId: usuarioId(),
    em: instante("em").notNull().defaultNow(),
    origem: text("origem", { enum: ["analise", "assistente"] }).notNull(),
    custoUsd: decimal("custo_usd").notNull(),
  },
  (t) => [
    index("gastos_ia_usuario_em").on(t.usuarioId, t.em.desc()),
    check("gastos_ia_origem", sql`${t.origem} in ('analise', 'assistente')`),
    check("gastos_ia_custo", sql`${t.custoUsd} >= 0`),
  ],
);
