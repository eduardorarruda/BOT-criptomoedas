import type { Candle } from "@zentrade/dominio";
import { lerCsvCandles } from "../dados-b3/csv.js";
import type { Fuso } from "../dados-b3/fuso.js";

/** De onde vêm as velas de 5 min do WIN (em PONTOS, fechadas, em ordem). */
export interface FonteVelasB3 {
  velas5m(): Promise<Candle[]>;
}

/**
 * Os CSVs que o MT5 escreve (export completo e o arquivo ao vivo do EA ZenTradeWINVivo).
 * Arquivo que não existe ou não abre é pulado: a falta de dado aparece como cotação velha.
 */
export function fonteDeArquivosMt5(o: {
  readonly arquivos: readonly string[];
  readonly ler: (caminho: string) => Promise<Buffer>;
  readonly fuso: Fuso;
}): FonteVelasB3 {
  return {
    velas5m: async () => {
      const listas = await Promise.all(
        o.arquivos.map(async (a) => {
          try {
            return lerCsvCandles(await o.ler(a), { intervalo: "5m", fuso: o.fuso, formato: "mt5" }).candles;
          } catch {
            return [];
          }
        }),
      );
      return juntar(listas);
    },
  };
}

/** Várias fontes numa só: abertura repetida vale a da fonte mais à direita (a mais recente). */
export function combinarFontes(...fontes: readonly FonteVelasB3[]): FonteVelasB3 {
  return { velas5m: async () => juntar(await Promise.all(fontes.map((f) => f.velas5m()))) };
}

function juntar(listas: readonly (readonly Candle[])[]): Candle[] {
  const porAbertura = new Map<number, Candle>();
  for (const l of listas) for (const c of l) porAbertura.set(c.abertura, c);
  return [...porAbertura.values()].sort((a, b) => a.abertura - b.abertura);
}

/** Lê uma vez e guarda (o export completo do MT5 não muda enquanto o motor roda). Leitura vazia tenta de novo. */
export function memorizar(fonte: FonteVelasB3): FonteVelasB3 {
  let guardadas: Candle[] | null = null;
  return {
    velas5m: async () => {
      if (guardadas) return guardadas;
      const lidas = await fonte.velas5m();
      if (lidas.length > 0) guardadas = lidas;
      return lidas;
    },
  };
}

/**
 * Junta cada leitura com as anteriores e fica só com as `maximo` mais recentes: o arquivo
 * ao vivo do EA tem uma janela curta, e a história do robô não pode encolher com ela.
 */
export function acumular(fonte: FonteVelasB3, maximo: number): FonteVelasB3 {
  let vistas: Candle[] = [];
  return {
    velas5m: async () => {
      vistas = juntar([vistas, await fonte.velas5m()]).slice(-maximo);
      return vistas;
    },
  };
}
