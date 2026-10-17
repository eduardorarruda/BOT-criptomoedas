import { sql } from "drizzle-orm";
import { check, foreignKey, index, integer, pgTable, text, unique, uuid, vector } from "drizzle-orm/pg-core";
import { usuarios } from "./acesso.js";
import { instante, tsvector } from "./tipos.js";

/** Tabelas do RAG exatamente como em docs/contrato-api.md (índices hnsw e gin na migração manual). */
export const FONTES = ["diario", "noticia", "regra_corretora", "estrategia", "nota"] as const;
export const DIMENSOES_EMBEDDING = 1024;

/**
 * Busca textual em português: 'portuguese' junta formas como operação/operações; a
 * zentrade_pt (migração 0012: unaccent + radical) faz "acoes" achar "ações" e
 * "indice" achar "índice". O vetor guarda as duas leituras.
 */
const textoBuscavel = (coluna: string) =>
  sql.raw(`to_tsvector('portuguese', ${coluna}) || to_tsvector('zentrade_pt', ${coluna})`);

export const documentos = pgTable(
  "documentos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    usuarioId: uuid("usuario_id")
      .notNull()
      .references(() => usuarios.id, { onDelete: "cascade" }),
    fonte: text("fonte", { enum: FONTES }).notNull(),
    titulo: text("titulo").notNull(),
    url: text("url"),
    publicadoEm: instante("publicado_em").notNull(),
    hashConteudo: text("hash_conteudo").notNull(),
    criadoEm: instante("criado_em").notNull().defaultNow(),
    busca: tsvector("busca").generatedAlwaysAs(textoBuscavel("titulo")),
  },
  (t) => [
    unique("documentos_usuario_hash").on(t.usuarioId, t.hashConteudo),
    unique("documentos_id_usuario").on(t.id, t.usuarioId),
    check("documentos_fonte", sql.raw(`fonte in (${FONTES.map((f) => `'${f}'`).join(", ")})`)),
  ],
);

export const trechos = pgTable(
  "trechos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentoId: uuid("documento_id").notNull(),
    usuarioId: uuid("usuario_id")
      .notNull()
      .references(() => usuarios.id, { onDelete: "cascade" }),
    ordem: integer("ordem").notNull(),
    texto: text("texto").notNull(),
    // Sem vetor quando não há provedor de embeddings (EMBEDDINGS_PROVEDOR=nenhum);
    // reindexar-conhecimento preenche depois.
    embedding: vector("embedding", { dimensions: DIMENSOES_EMBEDDING }),
    busca: tsvector("busca").generatedAlwaysAs(textoBuscavel("texto")),
    criadoEm: instante("criado_em").notNull().defaultNow(),
  },
  (t) => [
    // usuario_id na chave estrangeira: um trecho nunca aponta para documento de outra pessoa.
    foreignKey({
      name: "trechos_documento_fk",
      columns: [t.documentoId, t.usuarioId],
      foreignColumns: [documentos.id, documentos.usuarioId],
    }).onDelete("cascade"),
    index("trechos_usuario_documento").on(t.usuarioId, t.documentoId),
  ],
);
