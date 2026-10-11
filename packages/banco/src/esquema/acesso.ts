import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { instante } from "./tipos.js";

export const usuarios = pgTable(
  "usuarios",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    nome: text("nome").notNull(),
    senhaHash: text("senha_hash").notNull(),
    /** Segredo TOTP cifrado em envelope (mesma cifra das chaves da corretora). */
    segredo2fa: text("segredo_2fa"),
    doisFatores: boolean("dois_fatores").notNull().default(false),
    criadoEm: instante("criado_em").notNull().defaultNow(),
  },
  (t) => [
    unique("usuarios_email_unico").on(t.email),
    check("usuarios_email_minusculo", sql`${t.email} = lower(${t.email})`),
  ],
);

export const sessoes = pgTable(
  "sessoes",
  {
    /** SHA-256 do token: o token em claro só existe no cookie da pessoa. */
    id: text("id").primaryKey(),
    usuarioId: uuid("usuario_id")
      .notNull()
      .references(() => usuarios.id, { onDelete: "cascade" }),
    csrf: text("csrf").notNull(),
    criadaEm: instante("criada_em").notNull().defaultNow(),
    expiraEm: instante("expira_em").notNull(),
    reautenticadaEm: instante("reautenticada_em").notNull().defaultNow(),
  },
  (t) => [index("sessoes_usuario").on(t.usuarioId)],
);

export const tokensApi = pgTable(
  "tokens_api",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    usuarioId: uuid("usuario_id")
      .notNull()
      .references(() => usuarios.id, { onDelete: "cascade" }),
    nome: text("nome").notNull(),
    /** SHA-256 do token; o token em claro aparece uma vez, na criação. */
    hash: text("hash").notNull(),
    escopo: text("escopo", { enum: ["leitura", "operar"] }).notNull(),
    criadoEm: instante("criado_em").notNull().defaultNow(),
    ultimoUsoEm: instante("ultimo_uso_em"),
  },
  (t) => [
    unique("tokens_api_hash_unico").on(t.hash),
    index("tokens_api_usuario").on(t.usuarioId),
    check("tokens_api_escopo", sql`${t.escopo} in ('leitura', 'operar')`),
  ],
);

export const contasCorretora = pgTable(
  "contas_corretora",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    usuarioId: uuid("usuario_id")
      .notNull()
      .references(() => usuarios.id, { onDelete: "cascade" }),
    corretora: text("corretora", { enum: ["binance"] }).notNull(),
    rede: text("rede", { enum: ["testnet", "real"] }).notNull(),
    /** AES-256-GCM em envelope; a chave mestra fica fora do banco (ZENTRADE_CHAVE_MESTRA). */
    apiKeyCifrada: text("api_key_cifrada").notNull(),
    apiSecretCifrado: text("api_secret_cifrado").notNull(),
    apiKeyFinal: text("api_key_final").notNull(),
    criadaEm: instante("criada_em").notNull().defaultNow(),
  },
  (t) => [
    unique("contas_corretora_unica").on(t.usuarioId, t.corretora, t.rede),
    check("contas_corretora_corretora", sql`${t.corretora} in ('binance')`),
    check("contas_corretora_rede", sql`${t.rede} in ('testnet', 'real')`),
  ],
);

/** Parada total de cada pessoa: vale para todos os robôs dela. */
export const configuracaoGlobal = pgTable("configuracao_global", {
  usuarioId: uuid("usuario_id")
    .primaryKey()
    .references(() => usuarios.id, { onDelete: "cascade" }),
  paradaTotal: boolean("parada_total").notNull().default(false),
  atualizadaEm: instante("atualizada_em").notNull().defaultNow(),
});

/**
 * Trilha de auditoria encadeada: cada registro guarda o hash do anterior (da mesma
 * pessoa), calculado por gatilho no banco. Só aceita INSERT.
 */
export const auditoria = pgTable(
  "auditoria",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    usuarioId: uuid("usuario_id").references(() => usuarios.id),
    sequencia: integer("sequencia").notNull().default(0),
    em: instante("em").notNull().defaultNow(),
    acao: text("acao").notNull(),
    alvo: text("alvo"),
    detalhes: jsonb("detalhes").notNull().default({}),
    hashAnterior: text("hash_anterior").notNull().default(""),
    hash: text("hash").notNull().default(""),
  },
  (t) => [unique("auditoria_sequencia_unica").on(t.usuarioId, t.sequencia).nullsNotDistinct()],
);
