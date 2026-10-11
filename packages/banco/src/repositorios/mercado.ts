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

/** Agregados contínuos montados a partir dos candles de 1m (migração manual). */
const AGREGADOS: Partial<Record<Intervalo, string>> = { "5m": "candles_5m", "1h": "candles_1h" };

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

  return {
    /** Do mais antigo ao mais recente; `fim` exclusivo. 5m e 1h caem no agregado se não houver candle gravado. */
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
      const visao = AGREGADOS[c.intervalo];
      if (linhas.length === 0 && visao) return doAgregado(visao, c);
      return linhas.map(paraDTO);
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
