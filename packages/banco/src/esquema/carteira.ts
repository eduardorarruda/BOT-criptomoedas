import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
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

const usuarioId = () =>
  uuid("usuario_id")
    .notNull()
    .references(() => usuarios.id, { onDelete: "cascade" });

const rede = () => text("rede", { enum: ["testnet", "real"] }).notNull();

/**
 * Negociações (fills) importadas da conta da pessoa na Binance. A Binance é a fonte:
 * importar de novo não duplica (único por pessoa, rede, par e id da negociação).
 * Cotação e taxa em USDT ficam gravadas como foram convertidas no instante.
 */
export const carteiraNegociacoes = pgTable(
  "carteira_negociacoes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    usuarioId: usuarioId(),
    rede: rede(),
    simbolo: text("simbolo").notNull(),
    base: text("base").notNull(),
    cotacao: text("cotacao").notNull(),
    idNegociacao: bigint("id_negociacao", { mode: "number" }).notNull(),
    idOrdem: bigint("id_ordem", { mode: "number" }).notNull(),
    idCliente: text("id_cliente"),
    origem: text("origem", { enum: ["robo", "manual"] }).notNull(),
    lado: text("lado", { enum: ["COMPRA", "VENDA"] }).notNull(),
    preco: decimal("preco").notNull(),
    quantidade: decimal("quantidade").notNull(),
    valorCotacao: decimal("valor_cotacao").notNull(),
    taxa: decimal("taxa").notNull(),
    ativoTaxa: text("ativo_taxa").notNull(),
    cotacaoUsdt: decimal("cotacao_usdt"),
    taxaUsdt: decimal("taxa_usdt"),
    em: instante("em").notNull(),
    importadaEm: instante("importada_em").notNull().defaultNow(),
  },
  (t) => [
    unique("carteira_negociacoes_unica").on(t.usuarioId, t.rede, t.simbolo, t.idNegociacao),
    index("carteira_negociacoes_base").on(t.usuarioId, t.rede, t.base),
    index("carteira_negociacoes_cotacao").on(t.usuarioId, t.rede, t.cotacao),
    check("carteira_negociacoes_rede", sql`${t.rede} in ('testnet', 'real')`),
    check("carteira_negociacoes_origem", sql`${t.origem} in ('robo', 'manual')`),
    check("carteira_negociacoes_lado", sql`${t.lado} in ('COMPRA', 'VENDA')`),
    check("carteira_negociacoes_quantidade_positiva", sql`${t.quantidade} > 0`),
  ],
);

/** Saldo de cada moeda na última sincronização (a foto da conta, trocada inteira a cada vez). */
export const carteiraSaldos = pgTable(
  "carteira_saldos",
  {
    usuarioId: usuarioId(),
    rede: rede(),
    ativo: text("ativo").notNull(),
    livre: decimal("livre").notNull(),
    bloqueado: decimal("bloqueado").notNull(),
    atualizadoEm: instante("atualizado_em").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ name: "carteira_saldos_pk", columns: [t.usuarioId, t.rede, t.ativo] }),
    check("carteira_saldos_rede", sql`${t.rede} in ('testnet', 'real')`),
  ],
);

/** Estado da sincronização por pessoa e rede: quando foi, se deu certo e os pares conhecidos. */
export const carteiraSincronizacoes = pgTable(
  "carteira_sincronizacoes",
  {
    usuarioId: usuarioId(),
    rede: rede(),
    em: instante("em").notNull(),
    ok: boolean("ok").notNull(),
    erro: text("erro"),
    negociacoes: integer("negociacoes").notNull().default(0),
    /** Pares já vistos com negociação: entram em toda sincronização seguinte. */
    simbolos: text("simbolos")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
  },
  (t) => [
    primaryKey({ name: "carteira_sincronizacoes_pk", columns: [t.usuarioId, t.rede] }),
    check("carteira_sincronizacoes_rede", sql`${t.rede} in ('testnet', 'real')`),
  ],
);
