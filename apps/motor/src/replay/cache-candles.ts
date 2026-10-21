import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { dec, type Candle } from "@zentrade/dominio";
import { z } from "zod";

const Linha = z.tuple([z.number(), z.number(), z.string(), z.string(), z.string(), z.string(), z.string()]);

const doArquivo = (l: z.infer<typeof Linha>): Candle => ({
  abertura: l[0],
  fechamento: l[1],
  abre: dec(l[2]),
  maxima: dec(l[3]),
  minima: dec(l[4]),
  fecha: dec(l[5]),
  volume: dec(l[6]),
});

const paraArquivo = (c: Candle): z.infer<typeof Linha> => [
  c.abertura,
  c.fechamento,
  c.abre.toString(),
  c.maxima.toString(),
  c.minima.toString(),
  c.fecha.toString(),
  c.volume.toString(),
];

export interface PedidoCache {
  readonly pasta: string;
  readonly simbolo: string;
  readonly intervalo: string;
  readonly inicio: number;
  readonly fim: number;
}

/**
 * Candles em cache de arquivo (um por par e período): a primeira vez baixa, as outras
 * leem do disco. O cache é a fotografia dos dados do experimento: o relatório de hoje e o
 * de amanhã usam exatamente os mesmos candles.
 */
export async function candlesComCache(p: PedidoCache, baixar: () => Promise<Candle[]>): Promise<Candle[]> {
  const arquivo = join(p.pasta, `${p.simbolo}-${p.intervalo}-${p.inicio}-${p.fim}.json`);
  try {
    return z
      .array(Linha)
      .parse(JSON.parse(await readFile(arquivo, "utf8")))
      .map(doArquivo);
  } catch (erro) {
    if ((erro as NodeJS.ErrnoException).code !== "ENOENT") throw erro;
  }
  const candles = await baixar();
  await mkdir(p.pasta, { recursive: true });
  await writeFile(arquivo, JSON.stringify(candles.map(paraArquivo)));
  return candles;
}
