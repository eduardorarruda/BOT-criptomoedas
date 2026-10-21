import { sql } from "drizzle-orm";
import { check, index, jsonb, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";
import { decimal, instante } from "./tipos.js";

export const VEREDITOS_REPLAY = ["aprovou", "vetou"] as const;

/**
 * Replay histórico do Claude: uma linha por sinal passado que o agente analisou com o
 * contexto só até o instante do sinal. Tabela PRÓPRIA, de propósito: não tem robô,
 * usuário nem ordem, a aplicação (zentrade_app) não enxerga e o motor ao vivo nunca a
 * lê, então uma análise de replay não pode virar ordem nem aparecer no placar ao vivo.
 * Só o comando de replay do motor grava e lê (acesso de sistema). O desfecho de cada
 * sinal NÃO é gravado: é recalculado dos candles no relatório.
 */
export const replayAnalises = pgTable(
  "replay_analises",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Identifica a rodada (estratégia + janela); refazer a mesma rodada não repete análise. */
    execucao: text("execucao").notNull(),
    simbolo: text("simbolo").notNull(),
    /** O instante da decisão: o fechamento do candle do sinal (ms exatos do candle seguinte). */
    sinalEm: instante("sinal_em").notNull(),
    /** O preço de referência da análise: o fechamento do candle do sinal. */
    preco: decimal("preco").notNull(),
    sinal: jsonb("sinal").notNull(),
    proposta: jsonb("proposta").notNull(),
    /** `aprovou` = a proposta final foi comprar (já passou pela regra dos cenários). */
    veredito: text("veredito", { enum: VEREDITOS_REPLAY }).notNull(),
    custoIaUsd: decimal("custo_ia_usd").notNull(),
    criadaEm: instante("criada_em").notNull().defaultNow(),
  },
  (t) => [
    unique("replay_analises_sinal").on(t.execucao, t.simbolo, t.sinalEm),
    index("replay_analises_execucao").on(t.execucao, t.sinalEm),
    check("replay_analises_veredito", sql`${t.veredito} in ('aprovou', 'vetou')`),
    check("replay_analises_custo", sql`${t.custoIaUsd} >= 0`),
  ],
);
