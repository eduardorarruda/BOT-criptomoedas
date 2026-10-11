import type { Intervalo } from "@zentrade/contratos";
import { paraTexto, type Candle } from "@zentrade/dominio";
import { and, asc, eq, gte, lt, sql } from "drizzle-orm";
import type { Db } from "../cliente.js";
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
 * ainda é barata (15m a partir de 1m; 4h e 1d a partir do agregado de 1h).
 */
const REAGRUPADOS: Partial<Record<Intervalo, { readonly passo: string; readonly fonte: "1m" | "1h" }>> = {
  "15m": { passo: "15 minutes", fonte: "1m" },
  "4h": { passo: "4 hours", fonte: "1h" },
  "1d": { passo: "1 day", fonte: "1h" },
};

export interface ConsultaCandles {
  readonly simbolo: string;
  readonly intervalo: Intervalo;
  readonly inicio: number;
  readonly fim: number;
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

    /** Para o motor: grava (ou corrige) candles fechados. */
    async gravar(simbolo: string, intervalo: Intervalo, lista: readonly Candle[]): Promise<void> {
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
    },
  };
}

export type RepositorioMercado = ReturnType<typeof repositorioMercado>;
