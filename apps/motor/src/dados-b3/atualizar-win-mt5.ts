import { MS_POR_INTERVALO } from "@zentrade/contratos";
import { dec, type Candle } from "@zentrade/dominio";
import { gravarCandlesB3, type CandlesSubstituiveis, type ResumoGravacao } from "./importar.js";
import type { FonteBarrasMt5 } from "./fonte-mt5.js";
import type { Fuso } from "./fuso.js";
import { paraUtcMt5 } from "./fuso-mt5.js";
import { detectarSimboloContinuoWin } from "./simbolo-continuo-mt5.js";

export interface DependenciasAtualizacaoMt5 {
  readonly fonte: FonteBarrasMt5;
  readonly banco: CandlesSubstituiveis;
  readonly agora: () => number;
  /** Nome do contínuo nesta corretora (ex.: "WIN$N"); sem isso, tenta os candidatos conhecidos. */
  readonly simboloConfigurado?: string;
}

export interface PedidoAtualizacaoMt5 {
  /** Desde a última vela gravada (ou o início do histórico pedido, na primeira vez). */
  readonly desde: number;
  readonly ate: number;
  readonly fusoServidor: Fuso;
}

export interface ResumoAtualizacaoMt5 extends ResumoGravacao {
  /** O símbolo contínuo que a corretora tinha (útil para a tela mostrar o que foi usado). */
  readonly simboloContinuo: string;
}

const INTERVALO = "5m" as const;

/**
 * Busca as barras que faltam no `coletor-mt5`, converte do horário do servidor para
 * UTC e grava como `WIN` em 5m (15m e 1h montados por `gravarCandlesB3`, reusando a
 * mesma gravação idempotente do importador de arquivos da B3). Upsert: rodar de novo
 * com o mesmo período não duplica nada.
 */
export async function atualizarWinMt5(
  d: DependenciasAtualizacaoMt5,
  p: PedidoAtualizacaoMt5,
): Promise<ResumoAtualizacaoMt5> {
  const simbolos = await d.fonte.simbolosWin();
  const simboloContinuo = detectarSimboloContinuoWin(simbolos, d.simboloConfigurado);
  const barras = await d.fonte.barras({
    simbolo: simboloContinuo,
    intervalo: INTERVALO,
    de: p.desde,
    ate: p.ate,
  });
  const candles: Candle[] = barras.map((b) => {
    const abertura = paraUtcMt5(b.tempoServidorNaive, p.fusoServidor);
    return {
      abertura,
      fechamento: abertura + MS_POR_INTERVALO[INTERVALO] - 1,
      abre: dec(b.abre),
      maxima: dec(b.maxima),
      minima: dec(b.minima),
      fecha: dec(b.fecha),
      volume: dec(b.volume),
    };
  });
  const resumo = await gravarCandlesB3(d.banco, "WIN", INTERVALO, candles, { agora: d.agora() });
  return { ...resumo, simboloContinuo };
}
