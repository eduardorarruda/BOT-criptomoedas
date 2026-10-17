import { MS_POR_INTERVALO, type Intervalo } from "@zentrade/contratos";
import { dec, type Candle, type Valor } from "@zentrade/dominio";

/**
 * Junta candles de um intervalo num maior (5m → 15m → 1h): abertura do primeiro,
 * máxima e mínima do grupo, fechamento do último e volume somado. O grupo começa num
 * múltiplo do intervalo maior em UTC; como Brasília está a horas inteiras do UTC, isso
 * dá as mesmas fronteiras no relógio da B3. Buraco não é preenchido: o grupo sai só
 * com os candles que existem. Abertura repetida conta uma vez (vale a última lida).
 */
export function agregar(lista: readonly Candle[], de: Intervalo, para: Intervalo): Candle[] {
  const msDe = MS_POR_INTERVALO[de];
  const msPara = MS_POR_INTERVALO[para];
  if (msPara <= msDe || msPara % msDe !== 0)
    throw new RangeError(`não dá para montar candles de ${para} a partir de ${de}`);
  const unicos = [...new Map(lista.map((c) => [c.abertura, c])).values()].sort(
    (a, b) => a.abertura - b.abertura,
  );
  const grupos = new Map<number, Candle[]>();
  for (const c of unicos) {
    const inicio = c.abertura - (((c.abertura % msPara) + msPara) % msPara);
    grupos.set(inicio, [...(grupos.get(inicio) ?? []), c]);
  }
  return [...grupos.entries()].map(([inicio, g]) => juntar(inicio, msPara, g));
}

function juntar(inicio: number, ms: number, g: readonly Candle[]): Candle {
  const primeiro = g[0] as Candle;
  const ultimo = g.at(-1) as Candle;
  return {
    abertura: inicio,
    fechamento: inicio + ms - 1,
    abre: primeiro.abre,
    maxima: g.reduce((m, c) => (c.maxima.gt(m) ? c.maxima : m), primeiro.maxima),
    minima: g.reduce((m, c) => (c.minima.lt(m) ? c.minima : m), primeiro.minima),
    fecha: ultimo.fecha,
    volume: g.reduce((soma: Valor, c) => soma.plus(c.volume), dec(0)),
  };
}
