import { sql } from "drizzle-orm";
import { check, foreignKey, index, integer, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { usuarios } from "./acesso.js";
import { decisoes } from "./operacao.js";
import { decimal, instante } from "./tipos.js";

export const VEREDICTOS_CLAUDE = ["aprovou", "vetou"] as const;
export const FONTES_AVALIACAO = ["real", "contrafactual"] as const;
export const SITUACOES_AVALIACAO = ["concluida", "pendente"] as const;
export const MOTIVOS_AVALIACAO = ["stop", "alvo", "regra", "tempo", "zeragem", "horizonte"] as const;

const lista = (valores: readonly string[]) => sql.raw(valores.map((v) => `'${v}'`).join(", "));

/**
 * O placar do Claude: uma linha por decisão de ENTRADA que passou por ele (aprovou ou
 * vetou). O avaliador do motor grava (acesso de sistema) e regrava enquanto estiver
 * `pendente`; concluída, não muda mais. `real`: o resultado da posição executada;
 * `contrafactual`: a simulação da entrada sobre os candles seguintes. RLS por
 * usuario_id, como as decisões; a aplicação só lê.
 */
export const avaliacoesDecisao = pgTable(
  "avaliacoes_decisao",
  {
    decisaoId: uuid("decisao_id").primaryKey(),
    usuarioId: uuid("usuario_id")
      .notNull()
      .references(() => usuarios.id, { onDelete: "cascade" }),
    claude: text("claude", { enum: VEREDICTOS_CLAUDE }).notNull(),
    confianca: decimal("confianca").notNull(),
    fonte: text("fonte", { enum: FONTES_AVALIACAO }).notNull(),
    situacao: text("situacao", { enum: SITUACOES_AVALIACAO }).notNull(),
    motivo: text("motivo", { enum: MOTIVOS_AVALIACAO }),
    /** O tamanho usado na conta (o da decisão ou o de referência pelo risco do robô). */
    quantidade: decimal("quantidade"),
    precoEntrada: decimal("preco_entrada"),
    precoSaida: decimal("preco_saida"),
    resultado: decimal("resultado"),
    retorno: decimal("retorno"),
    /** Candles depois da decisão (até a saída, ou os vistos até agora se pendente). */
    barras: integer("barras").notNull().default(0),
    moeda: text("moeda").notNull(),
    avaliadaEm: instante("avaliada_em").notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "avaliacoes_decisao_decisao_fk",
      columns: [t.decisaoId, t.usuarioId],
      foreignColumns: [decisoes.id, decisoes.usuarioId],
    }).onDelete("cascade"),
    index("avaliacoes_decisao_usuario").on(t.usuarioId, t.avaliadaEm.desc()),
    index("avaliacoes_decisao_pendentes")
      .on(t.decisaoId)
      .where(sql`${t.situacao} = 'pendente'`),
    check("avaliacoes_decisao_claude", sql`${t.claude} in (${lista(VEREDICTOS_CLAUDE)})`),
    check("avaliacoes_decisao_fonte", sql`${t.fonte} in (${lista(FONTES_AVALIACAO)})`),
    check("avaliacoes_decisao_situacao", sql`${t.situacao} in (${lista(SITUACOES_AVALIACAO)})`),
    check(
      "avaliacoes_decisao_motivo",
      sql`${t.motivo} is null or ${t.motivo} in (${lista(MOTIVOS_AVALIACAO)})`,
    ),
    check("avaliacoes_decisao_confianca", sql`${t.confianca} between 0 and 1`),
    check(
      "avaliacoes_decisao_concluida",
      sql`${t.situacao} = 'pendente' or (${t.resultado} is not null and ${t.retorno} is not null)`,
    ),
  ],
);
