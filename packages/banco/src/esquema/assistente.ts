import { sql } from "drizzle-orm";
import { check, foreignKey, index, integer, jsonb, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";
import { usuarios } from "./acesso.js";
import { documentos } from "./conhecimento.js";
import { instante } from "./tipos.js";

/**
 * Assistente e conhecimento por arquivo (migração manual 0006_assistente_conhecimento).
 * Tudo por pessoa, com RLS por usuario_id como o resto do banco.
 */

export const PROVEDORES_IA = ["api", "cli"] as const;
export const PAPEIS_MENSAGEM = ["usuario", "assistente"] as const;
export const SITUACOES_MENSAGEM = ["ok", "erro", "interrompida"] as const;
export const ORIGENS_DOCUMENTO = ["texto", "arquivo", "link", "automacao"] as const;
export const TIPOS_ARQUIVO = ["pdf", "docx", "md", "txt", "html"] as const;

const lista = (valores: readonly string[]) => valores.map((v) => `'${v}'`).join(", ");

/** Qual "cérebro" responde por esta pessoa (analista e assistente). Sem linha = o padrão (API). */
export const assistenteConfig = pgTable(
  "assistente_config",
  {
    usuarioId: uuid("usuario_id")
      .primaryKey()
      .references(() => usuarios.id, { onDelete: "cascade" }),
    provedor: text("provedor", { enum: PROVEDORES_IA }).notNull().default("api"),
    modelo: text("modelo"),
    contaCli: text("conta_cli"),
    atualizadoEm: instante("atualizado_em").notNull().defaultNow(),
  },
  () => [check("assistente_config_provedor", sql.raw(`provedor in (${lista(PROVEDORES_IA)})`))],
);

export const assistenteConversas = pgTable(
  "assistente_conversas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    usuarioId: uuid("usuario_id")
      .notNull()
      .references(() => usuarios.id, { onDelete: "cascade" }),
    titulo: text("titulo").notNull(),
    criadaEm: instante("criada_em").notNull().defaultNow(),
    atualizadaEm: instante("atualizada_em").notNull().defaultNow(),
  },
  (t) => [
    unique("assistente_conversas_id_usuario").on(t.id, t.usuarioId),
    index("assistente_conversas_usuario").on(t.usuarioId, t.atualizadaEm),
  ],
);

export const assistenteMensagens = pgTable(
  "assistente_mensagens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversaId: uuid("conversa_id").notNull(),
    usuarioId: uuid("usuario_id")
      .notNull()
      .references(() => usuarios.id, { onDelete: "cascade" }),
    papel: text("papel", { enum: PAPEIS_MENSAGEM }).notNull(),
    texto: text("texto").notNull(),
    fontes: jsonb("fontes").notNull().default([]),
    ferramentas: jsonb("ferramentas").notNull().default([]),
    situacao: text("situacao", { enum: SITUACOES_MENSAGEM }).notNull().default("ok"),
    erro: text("erro"),
    provedor: text("provedor", { enum: PROVEDORES_IA }),
    modelo: text("modelo"),
    criadaEm: instante("criada_em").notNull().defaultNow(),
  },
  (t) => [
    // usuario_id na chave: uma mensagem nunca cai na conversa de outra pessoa.
    foreignKey({
      name: "assistente_mensagens_conversa_fk",
      columns: [t.conversaId, t.usuarioId],
      foreignColumns: [assistenteConversas.id, assistenteConversas.usuarioId],
    }).onDelete("cascade"),
    index("assistente_mensagens_conversa").on(t.conversaId, t.criadaEm),
    check("assistente_mensagens_papel", sql.raw(`papel in (${lista(PAPEIS_MENSAGEM)})`)),
    check("assistente_mensagens_situacao", sql.raw(`situacao in (${lista(SITUACOES_MENSAGEM)})`)),
  ],
);

/** De onde veio cada documento do RAG (sem linha = texto ou automação antiga). */
export const documentosOrigem = pgTable(
  "documentos_origem",
  {
    documentoId: uuid("documento_id").primaryKey(),
    usuarioId: uuid("usuario_id")
      .notNull()
      .references(() => usuarios.id, { onDelete: "cascade" }),
    origem: text("origem", { enum: ORIGENS_DOCUMENTO }).notNull(),
    nomeArquivo: text("nome_arquivo"),
    tipoArquivo: text("tipo_arquivo", { enum: TIPOS_ARQUIVO }),
    bytes: integer("bytes"),
    criadoEm: instante("criado_em").notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "documentos_origem_documento_fk",
      columns: [t.documentoId, t.usuarioId],
      foreignColumns: [documentos.id, documentos.usuarioId],
    }).onDelete("cascade"),
    check("documentos_origem_origem", sql.raw(`origem in (${lista(ORIGENS_DOCUMENTO)})`)),
    check(
      "documentos_origem_tipo",
      sql.raw(`tipo_arquivo is null or tipo_arquivo in (${lista(TIPOS_ARQUIVO)})`),
    ),
  ],
);
