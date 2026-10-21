import type { Intervalo } from "@zentrade/contratos";
import { paraTexto, type Candle } from "@zentrade/dominio";
import { and, asc, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import type { Db, Executor } from "../cliente.js";
import { decimalTexto, iso, ms } from "../conversao.js";
import { candles } from "../esquema/index.js";

export interface CandleDTO {
  readonly abertura: number;
  readonly abre: string;
  readonly maxima: string;
  readonly minima: string;
  readonly fecha: string;
  readonly volume: string;
}

export const LIMITE_CANDLES = 1000;

/** Último fechamento conhecido de um símbolo: o preço e o instante em que o candle fechou. */
export interface UltimoFechamento {
  readonly preco: string;
  readonly em: number;
}

interface LinhaCandle extends Record<string, unknown> {
  abertura: Date | string;
  abre: string;
  maxima: string;
  minima: string;
  fecha: string;
  volume: string;
}

const paraDTO = (l: LinhaCandle): CandleDTO => ({
  abertura: l.abertura instanceof Date ? ms(l.abertura) : new Date(l.abertura).getTime(),
  abre: decimalTexto(l.abre),
  maxima: decimalTexto(l.maxima),
  minima: decimalTexto(l.minima),
  fecha: decimalTexto(l.fecha),
  volume: decimalTexto(l.volume),
});

/** Agregados contínuos montados a partir dos candles de 1m (migração manual), em tempo real. */
const AGREGADOS: Partial<Record<Intervalo, string>> = { "5m": "candles_5m", "1h": "candles_1h" };

/**
 * Intervalos sem agregado próprio: saem de time_bucket sobre a fonte mais fina que
 * ainda é barata (15m e 30m a partir de 1m; 4h e 1d a partir do agregado de 1h).
 */
const REAGRUPADOS: Partial<Record<Intervalo, { readonly passo: string; readonly fonte: "1m" | "1h" }>> = {
  "15m": { passo: "15 minutes", fonte: "1m" },
  "30m": { passo: "30 minutes", fonte: "1m" },
  "4h": { passo: "4 hours", fonte: "1h" },
  "1d": { passo: "1 day", fonte: "1h" },
};

/** Que candles de um símbolo da B3 estão no banco, por intervalo. */
export interface CoberturaCandles {
  readonly simbolo: string;
  readonly intervalo: Intervalo;
  readonly primeiro: number;
  readonly ultimo: number;
  readonly candles: number;
}

export interface ConsultaCandles {
  readonly simbolo: string;
  readonly intervalo: Intervalo;
  readonly inicio: number;
  readonly fim: number;
}

/** Os candles de um intervalo, para `substituir`. */
export interface LoteCandles {
  readonly intervalo: Intervalo;
  readonly lista: readonly Candle[];
}

/** Upsert pela chave (símbolo, intervalo, abertura): corrige o candle que já existe. */
async function gravarCandles(
  db: Executor,
  simbolo: string,
  intervalo: Intervalo,
  lista: readonly Candle[],
): Promise<void> {
  if (lista.length === 0) return;
  const valores = lista.map((k) => ({
    simbolo,
    intervalo,
    abertura: new Date(k.abertura),
    fechamento: new Date(k.fechamento),
    abre: paraTexto(k.abre),
    maxima: paraTexto(k.maxima),
    minima: paraTexto(k.minima),
    fecha: paraTexto(k.fecha),
    volume: paraTexto(k.volume),
  }));
  await db
    .insert(candles)
    .values(valores)
    .onConflictDoUpdate({
      target: [candles.simbolo, candles.intervalo, candles.abertura],
      set: {
        fechamento: sql`excluded.fechamento`,
        abre: sql`excluded.abre`,
        maxima: sql`excluded.maxima`,
        minima: sql`excluded.minima`,
        fecha: sql`excluded.fecha`,
        volume: sql`excluded.volume`,
      },
    });
}

/** Dados de mercado: iguais para todos, sem RLS. */
export function repositorioMercado(db: Db) {
  async function doAgregado(visao: string, c: ConsultaCandles): Promise<CandleDTO[]> {
    const linhas = await db.execute<LinhaCandle>(sql`
      select abertura, abre::text, maxima::text, minima::text, fecha::text, volume::text
      from ${sql.identifier(visao)}
      where simbolo = ${c.simbolo} and abertura >= ${iso(c.inicio)}::timestamptz and abertura < ${iso(c.fim)}::timestamptz
      order by abertura limit ${LIMITE_CANDLES}`);
    return linhas.map(paraDTO);
  }

  async function reagrupado(passo: string, fonte: "1m" | "1h", c: ConsultaCandles): Promise<CandleDTO[]> {
    const origem =
      fonte === "1m"
        ? sql`(select * from candles where intervalo = '1m') as base`
        : sql`${sql.identifier("candles_1h")} as base`;
    const linhas = await db.execute<LinhaCandle>(sql`
      select time_bucket(${passo}::interval, abertura) as abertura,
             first(abre, abertura)::text as abre, max(maxima)::text as maxima, min(minima)::text as minima,
             last(fecha, abertura)::text as fecha, sum(volume)::text as volume
      from ${origem}
      where simbolo = ${c.simbolo} and abertura >= ${iso(c.inicio)}::timestamptz and abertura < ${iso(c.fim)}::timestamptz
      group by 1 order by 1 limit ${LIMITE_CANDLES}`);
    return linhas.map(paraDTO);
  }

  return {
    /**
     * Do mais antigo ao mais recente; `fim` exclusivo. Sem candle gravado no próprio
     * intervalo, 5m e 1h vêm do agregado contínuo e 15m, 4h e 1d são reagrupados.
     */
    async candles(c: ConsultaCandles): Promise<CandleDTO[]> {
      const linhas = await db
        .select()
        .from(candles)
        .where(
          and(
            eq(candles.simbolo, c.simbolo),
            eq(candles.intervalo, c.intervalo),
            gte(candles.abertura, new Date(c.inicio)),
            lt(candles.abertura, new Date(c.fim)),
          ),
        )
        .orderBy(asc(candles.abertura))
        .limit(LIMITE_CANDLES);
      if (linhas.length > 0) return linhas.map(paraDTO);
      const visao = AGREGADOS[c.intervalo];
      if (visao) return doAgregado(visao, c);
      const regra = REAGRUPADOS[c.intervalo];
      return regra ? reagrupado(regra.passo, regra.fonte, c) : [];
    },

    /**
     * Preço de referência: o fechamento do candle de 1m mais recente de cada símbolo,
     * aberto a partir de `desde`. Símbolo sem candle no período fica de fora do mapa.
     */
    async ultimosFechamentos(
      simbolos: readonly string[],
      desde: number,
    ): Promise<Map<string, UltimoFechamento>> {
      if (simbolos.length === 0) return new Map();
      const linhas = await db
        .selectDistinctOn([candles.simbolo], {
          simbolo: candles.simbolo,
          fecha: candles.fecha,
          fechamento: candles.fechamento,
        })
        .from(candles)
        .where(
          and(
            inArray(candles.simbolo, [...simbolos]),
            eq(candles.intervalo, "1m"),
            gte(candles.abertura, new Date(desde)),
          ),
        )
        .orderBy(candles.simbolo, desc(candles.abertura));
      return new Map(linhas.map((l) => [l.simbolo, { preco: decimalTexto(l.fecha), em: ms(l.fechamento) }]));
    },

    /**
     * O que há gravado dos símbolos pedidos (o mini índice: WIN e WIN-IBOV), por
     * intervalo: o primeiro e o último candle e quantos são. A tela usa para oferecer
     * só o que dá para testar.
     */
    async cobertura(simbolos: readonly string[]): Promise<CoberturaCandles[]> {
      if (simbolos.length === 0) return [];
      const linhas = await db
        .select({
          simbolo: candles.simbolo,
          intervalo: candles.intervalo,
          primeiro: sql<Date>`min(${candles.abertura})`,
          ultimo: sql<Date>`max(${candles.abertura})`,
          candles: sql<number>`count(*)::int`,
        })
        .from(candles)
        .where(inArray(candles.simbolo, [...simbolos]))
        .groupBy(candles.simbolo, candles.intervalo)
        .orderBy(asc(candles.simbolo), asc(candles.intervalo));
      return linhas.map((l) => ({
        simbolo: l.simbolo,
        // A coluna é texto livre (os da Binance e os da B3); só intervalos válidos são gravados.
        intervalo: l.intervalo as Intervalo,
        primeiro: new Date(l.primeiro).getTime(),
        ultimo: new Date(l.ultimo).getTime(),
        candles: Number(l.candles),
      }));
    },

    /**
     * Para os importadores da B3: troca, numa transação só, tudo o que há em
     * [inicio, fim) do símbolo nos intervalos dos lotes pelos candles dos lotes (o
     * pregão inteiro de uma vez). Se algo falhar no meio, nada muda. Devolve quantos
     * candles antigos foram apagados.
     */
    async substituir(
      simbolo: string,
      trecho: { readonly inicio: number; readonly fim: number },
      lotes: readonly LoteCandles[],
    ): Promise<number> {
      return db.transaction(async (tx) => {
        let apagados = 0;
        for (const { intervalo, lista } of lotes) {
          const linhas = await tx
            .delete(candles)
            .where(
              and(
                eq(candles.simbolo, simbolo),
                eq(candles.intervalo, intervalo),
                gte(candles.abertura, new Date(trecho.inicio)),
                lt(candles.abertura, new Date(trecho.fim)),
              ),
            )
            .returning({ abertura: candles.abertura });
          apagados += linhas.length;
          for (let i = 0; i < lista.length; i += LIMITE_CANDLES)
            await gravarCandles(tx, simbolo, intervalo, lista.slice(i, i + LIMITE_CANDLES));
        }
        return apagados;
      });
    },

    /** Para o motor: grava (ou corrige) candles fechados. */
    gravar: (simbolo: string, intervalo: Intervalo, lista: readonly Candle[]): Promise<void> =>
      gravarCandles(db, simbolo, intervalo, lista),
  };
}

export type RepositorioMercado = ReturnType<typeof repositorioMercado>;
