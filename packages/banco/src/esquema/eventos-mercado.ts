import { sql } from "drizzle-orm";
import { check, date, index, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";
import { usuarios } from "./acesso.js";
import { instante } from "./tipos.js";

export const MERCADOS_DO_EVENTO = ["win", "cripto", "todos"] as const;
export const IMPACTOS_DO_EVENTO = ["alto", "medio"] as const;
export const ORIGENS_DO_EVENTO = ["manual", "sugerido"] as const;
export const MODOS_DIAS_DE_EVENTO_BANCO = ["ignorar", "bloquear", "reduzir"] as const;

const lista = (valores: readonly string[]) => sql.raw(valores.map((v) => `'${v}'`).join(", "));

/**
 * Agenda de eventos de mercado da pessoa (Copom, payroll, eleição…), lida pelo filtro
 * opcional de "dia perigoso" dos robôs e dos backtests. `data` é o dia no fuso do
 * mercado (AAAA-MM-DD, sem hora); `de`/`ate` (HH:MM) restringem o evento a uma janela.
 * `sugerido` = veio do Claude e espera a pessoa confirmar ou remover. RLS por usuário.
 * Espelha `packages/banco/drizzle` (drizzle-kit); o GRANT e o RLS são manuais.
 */
export const eventosMercado = pgTable(
  "eventos_mercado",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    usuarioId: uuid("usuario_id")
      .notNull()
      .references(() => usuarios.id, { onDelete: "cascade" }),
    data: date("data", { mode: "string" }).notNull(),
    mercado: text("mercado", { enum: MERCADOS_DO_EVENTO }).notNull(),
    titulo: text("titulo").notNull(),
    impacto: text("impacto", { enum: IMPACTOS_DO_EVENTO }).notNull(),
    origem: text("origem", { enum: ORIGENS_DO_EVENTO }).notNull().default("manual"),
    de: text("de"),
    ate: text("ate"),
    criadoEm: instante("criado_em").notNull().defaultNow(),
  },
  (t) => [
    unique("eventos_mercado_unico").on(t.usuarioId, t.data, t.mercado, t.titulo),
    index("eventos_mercado_usuario_data").on(t.usuarioId, t.data),
    check("eventos_mercado_mercado", sql`${t.mercado} in (${lista(MERCADOS_DO_EVENTO)})`),
    check("eventos_mercado_impacto", sql`${t.impacto} in (${lista(IMPACTOS_DO_EVENTO)})`),
    check("eventos_mercado_origem", sql`${t.origem} in (${lista(ORIGENS_DO_EVENTO)})`),
    check("eventos_mercado_titulo", sql`char_length(btrim(${t.titulo})) between 1 and 120`),
    check(
      "eventos_mercado_janela",
      sql`(${t.de} is null and ${t.ate} is null) or (${t.de} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' and ${t.ate} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' and ${t.de} <= ${t.ate})`,
    ),
  ],
);
