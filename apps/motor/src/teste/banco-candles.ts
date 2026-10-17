import type { Intervalo } from "@zentrade/contratos";
import { paraTexto, type Candle } from "@zentrade/dominio";
import type { CandlesDoBanco } from "../backtest/candles-historicos.js";

/**
 * Tabela `candles` em memória: chave (símbolo, intervalo, abertura), gravar é upsert e a
 * leitura devolve no máximo 1000 por consulta, como o repositório real.
 */
export function bancoDeCandlesFalso() {
  const linhas = new Map<string, Candle>();
  const chave = (s: string, i: string, a: number) => `${s}|${i}|${a}`;
  const gravacoes: { simbolo: string; intervalo: Intervalo; quantos: number }[] = [];
  const banco: CandlesDoBanco = {
    candles: async (c) =>
      [...linhas.entries()]
        .filter(([k, v]) => k.startsWith(`${c.simbolo}|${c.intervalo}|`) && v.abertura >= c.inicio)
        .map(([, v]) => v)
        .filter((v) => v.abertura < c.fim)
        .sort((a, b) => a.abertura - b.abertura)
        .slice(0, 1000)
        .map((k) => ({
          abertura: k.abertura,
          abre: paraTexto(k.abre),
          maxima: paraTexto(k.maxima),
          minima: paraTexto(k.minima),
          fecha: paraTexto(k.fecha),
          volume: paraTexto(k.volume),
        })),
    gravar: async (simbolo, intervalo, lista) => {
      gravacoes.push({ simbolo, intervalo, quantos: lista.length });
      lista.forEach((k) => linhas.set(chave(simbolo, intervalo, k.abertura), k));
    },
  };
  const de = (simbolo: string, intervalo: Intervalo) =>
    [...linhas.entries()]
      .filter(([k]) => k.startsWith(`${simbolo}|${intervalo}|`))
      .map(([, v]) => v)
      .sort((a, b) => a.abertura - b.abertura);
  return { banco, gravacoes, de, total: () => linhas.size };
}
