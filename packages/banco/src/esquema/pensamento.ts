import { sql } from "drizzle-orm";
import { bigint, check, foreignKey, index, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { usuarios } from "./acesso.js";
import { robos } from "./operacao.js";
import { instante } from "./tipos.js";

export const CENARIOS = ["alta", "queda", "lateral", "indefinido"] as const;
export const MOTIVOS_HISTORICO = ["inicio", "cenario", "sinal"] as const;
const lista = (valores: readonly string[]) => sql.raw(valores.map((v) => `'${v}'`).join(", "));

const usuarioId = () =>
  uuid("usuario_id")
    .notNull()
    .references(() => usuarios.id, { onDelete: "cascade" });

/**
 * A última leitura de cada robô: o motor regrava (upsert) a cada vela fechada, mesmo sem
 * sinal. `pensamento` guarda o PensamentoRobo inteiro (cenário, condições e conclusão).
 * RLS por usuario_id; a aplicação só lê.
 */
export const pensamentosAtuais = pgTable(
  "pensamentos_atuais",
  {
    roboId: uuid("robo_id").primaryKey(),
    usuarioId: usuarioId(),
    em: instante("em").notNull(),
    cenario: text("cenario", { enum: CENARIOS }).notNull(),
    sinal: text("sinal", { enum: ["COMPRAR", "VENDER", "AGUARDAR"] }).notNull(),
    pensamento: jsonb("pensamento").notNull(),
    atualizadoEm: instante("atualizado_em").notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "pensamentos_atuais_robo_fk",
      columns: [t.roboId, t.usuarioId],
      foreignColumns: [robos.id, robos.usuarioId],
    }).onDelete("cascade"),
    check("pensamentos_atuais_cenario", sql`${t.cenario} in (${lista(CENARIOS)})`),
  ],
);

/**
 * O histórico curto: só a primeira leitura do robô, quando o cenário muda e quando há
 * sinal (comprar ou vender). O motor mantém no máximo LIMITE_HISTORICO_PENSAMENTO por robô.
 */
export const pensamentosHistorico = pgTable(
  "pensamentos_historico",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    usuarioId: usuarioId(),
    roboId: uuid("robo_id").notNull(),
    em: instante("em").notNull(),
    cenario: text("cenario", { enum: CENARIOS }).notNull(),
    sinal: text("sinal", { enum: ["COMPRAR", "VENDER", "AGUARDAR"] }).notNull(),
    motivo: text("motivo", { enum: MOTIVOS_HISTORICO }).notNull(),
    pensamento: jsonb("pensamento").notNull(),
  },
  (t) => [
    foreignKey({
      name: "pensamentos_historico_robo_fk",
      columns: [t.roboId, t.usuarioId],
      foreignColumns: [robos.id, robos.usuarioId],
    }).onDelete("cascade"),
    index("pensamentos_historico_robo_em").on(t.roboId, t.em.desc()),
    check("pensamentos_historico_cenario", sql`${t.cenario} in (${lista(CENARIOS)})`),
    check("pensamentos_historico_motivo", sql`${t.motivo} in (${lista(MOTIVOS_HISTORICO)})`),
  ],
);
