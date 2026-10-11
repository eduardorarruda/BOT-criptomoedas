import {
  MetricasBacktestEsquema,
  PontoCurvaBacktestEsquema,
  type Intervalo,
  type MetricasBacktest,
  type PontoCurvaBacktest,
} from "@zentrade/contratos";
import type { Estrategia } from "@zentrade/dominio";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { comoUsuario, type Db } from "../cliente.js";
import { estrategiaDominio, ms } from "../conversao.js";
import { codigoPostgres, ErroDados, umaLinha, VIOLACAO_CHAVE_ESTRANGEIRA } from "../erros.js";
import { backtests, estrategiaVersoes } from "../esquema/index.js";
import { limitar } from "./lista.js";

export type EstadoBacktest = "na_fila" | "rodando" | "concluido" | "falhou";

export interface PedidoBacktest {
  readonly estrategiaId: string;
  readonly versao: number;
  readonly simbolo: string;
  readonly intervalo: Intervalo;
  readonly inicio: number;
  readonly fim: number;
}

export interface Backtest extends PedidoBacktest {
  readonly id: string;
  readonly estado: EstadoBacktest;
  readonly metricas: MetricasBacktest | null;
  readonly curva: PontoCurvaBacktest[] | null;
  readonly erro: string | null;
  readonly criadoEm: number;
  readonly concluidoEm: number | null;
}

const CurvaEsquema = z.array(PontoCurvaBacktestEsquema);
const RESULTADO_FORA_DO_CONTRATO =
  "o motor gravou métricas ou curva fora do contrato (BacktestEsquema); rode o backtest de novo";

/** O jsonb gravado pelo motor só sai se bater com o contrato; se não bater, o erro diz por quê. */
function lerResultado(b: typeof backtests.$inferSelect) {
  const metricas = b.metricas === null ? null : MetricasBacktestEsquema.safeParse(b.metricas);
  const curva = b.curva === null ? null : CurvaEsquema.safeParse(b.curva);
  const foraDoContrato = metricas?.success === false || curva?.success === false;
  return {
    metricas: metricas?.success ? metricas.data : null,
    curva: curva?.success ? curva.data : null,
    erro: b.erro ?? (foraDoContrato ? RESULTADO_FORA_DO_CONTRATO : null),
  };
}

/** O que o motor precisa para rodar um backtest: o pedido e a versão exata da estratégia. */
export interface BacktestParaRodar extends Backtest {
  readonly estrategia: Estrategia;
}

const paraBacktest = (b: typeof backtests.$inferSelect): Backtest => ({
  id: b.id,
  estrategiaId: b.estrategiaId,
  versao: b.estrategiaVersao,
  simbolo: b.simbolo,
  intervalo: b.intervalo,
  inicio: ms(b.inicio),
  fim: ms(b.fim),
  estado: b.estado,
  ...lerResultado(b),
  criadoEm: ms(b.criadoEm),
  concluidoEm: b.concluidoEm ? ms(b.concluidoEm) : null,
});

export function repositorioBacktests(db: Db) {
  async function inserir(usuarioId: string, p: PedidoBacktest) {
    return comoUsuario(db, usuarioId, async (tx) =>
      umaLinha(
        await tx
          .insert(backtests)
          .values({
            usuarioId,
            estrategiaId: p.estrategiaId,
            estrategiaVersao: p.versao,
            simbolo: p.simbolo,
            intervalo: p.intervalo,
            inicio: new Date(p.inicio),
            fim: new Date(p.fim),
          })
          .returning({ id: backtests.id, estado: backtests.estado }),
      ),
    );
  }

  return {
    async criar(usuarioId: string, p: PedidoBacktest): Promise<{ id: string; estado: EstadoBacktest }> {
      if (p.fim <= p.inicio)
        throw new ErroDados("invalido", "o fim do backtest precisa ser depois do início");
      try {
        return await inserir(usuarioId, p);
      } catch (erro) {
        if (codigoPostgres(erro) === VIOLACAO_CHAVE_ESTRANGEIRA) {
          throw new ErroDados(
            "invalido",
            "essa estratégia ou versão não existe entre as suas; confira o id e a versão",
          );
        }
        throw erro;
      }
    },

    /** Mais recentes primeiro. */
    listar: (usuarioId: string, limite?: number): Promise<Backtest[]> =>
      comoUsuario(db, usuarioId, async (tx) =>
        (await tx.select().from(backtests).orderBy(desc(backtests.criadoEm)).limit(limitar(limite))).map(
          paraBacktest,
        ),
      ),

    obter: (usuarioId: string, id: string): Promise<Backtest | null> =>
      comoUsuario(db, usuarioId, async (tx) => {
        const [b] = await tx.select().from(backtests).where(eq(backtests.id, id));
        return b ? paraBacktest(b) : null;
      }),

    /** Para o motor (sistema): marca o início e devolve o pedido. */
    async iniciar(id: string): Promise<Backtest | null> {
      const [b] = await db
        .update(backtests)
        .set({ estado: "rodando" })
        .where(eq(backtests.id, id))
        .returning();
      return b ? paraBacktest(b) : null;
    },

    /**
     * Para o motor (sistema): marca como rodando e traz a estratégia. Aceita "rodando"
     * (job repetido depois de uma queda); concluído ou falho devolve null: não roda de novo.
     */
    async paraRodar(id: string): Promise<BacktestParaRodar | null> {
      const [b] = await db
        .update(backtests)
        .set({ estado: "rodando" })
        .where(and(eq(backtests.id, id), inArray(backtests.estado, ["na_fila", "rodando"])))
        .returning();
      if (!b) return null;
      const [v] = await db
        .select()
        .from(estrategiaVersoes)
        .where(
          and(
            eq(estrategiaVersoes.estrategiaId, b.estrategiaId),
            eq(estrategiaVersoes.versao, b.estrategiaVersao),
          ),
        );
      if (!v) throw new ErroDados("nao_encontrado", `a estratégia do backtest ${id} não existe mais`);
      return { ...paraBacktest(b), estrategia: estrategiaDominio(v) };
    },

    async concluir(id: string, resultado: { metricas: unknown; curva: unknown }): Promise<void> {
      await db
        .update(backtests)
        .set({ estado: "concluido", ...resultado, concluidoEm: new Date() })
        .where(eq(backtests.id, id));
    },

    async falhar(id: string, erro: string): Promise<void> {
      await db
        .update(backtests)
        .set({ estado: "falhou", erro, concluidoEm: new Date() })
        .where(eq(backtests.id, id));
    },
  };
}

export type RepositorioBacktests = ReturnType<typeof repositorioBacktests>;
