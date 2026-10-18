import { index, jsonb, pgTable, primaryKey, text, uuid } from "drizzle-orm/pg-core";
import { usuarios } from "./acesso.js";
import { decimal, instante } from "./tipos.js";

/**
 * Candles são dados de mercado, iguais para todos: não têm usuario_id nem RLS.
 * Viram hypertable do TimescaleDB na migração manual (compressão e retenção).
 */
export const candles = pgTable(
  "candles",
  {
    simbolo: text("simbolo").notNull(),
    intervalo: text("intervalo").notNull(),
    abertura: instante("abertura").notNull(),
    fechamento: instante("fechamento").notNull(),
    abre: decimal("abre").notNull(),
    maxima: decimal("maxima").notNull(),
    minima: decimal("minima").notNull(),
    fecha: decimal("fecha").notNull(),
    volume: decimal("volume").notNull(),
  },
  (t) => [primaryKey({ name: "candles_pk", columns: [t.simbolo, t.intervalo, t.abertura] })],
);

/**
 * Upload de um .zip "Negócio a negócio" da B3 (baixado à mão no BDI): a API grava a
 * linha e enfileira, o motor processa e grava o resumo. usuario_id é de quem enviou
 * (RLS por usuario_id), mas o dado gravado (candles) é de mercado, igual para todos.
 */
export const importacoesB3 = pgTable(
  "importacoes_b3",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    usuarioId: uuid("usuario_id")
      .notNull()
      .references(() => usuarios.id, { onDelete: "cascade" }),
    nomeArquivo: text("nome_arquivo").notNull(),
    caminho: text("caminho").notNull(),
    estado: text("estado", { enum: ["na_fila", "lendo", "concluida", "falhou"] })
      .notNull()
      .default("na_fila"),
    resumo: jsonb("resumo"),
    erro: text("erro"),
    criadoEm: instante("criado_em").notNull().defaultNow(),
    concluidoEm: instante("concluido_em"),
  },
  (t) => [index("importacoes_b3_usuario").on(t.usuarioId, t.criadoEm)],
);
