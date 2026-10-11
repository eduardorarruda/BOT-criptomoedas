import { pgTable, primaryKey, text } from "drizzle-orm/pg-core";
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
