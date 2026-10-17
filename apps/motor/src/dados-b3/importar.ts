import { MS_POR_INTERVALO } from "@zentrade/contratos";
import type { Candle } from "@zentrade/dominio";
import { candlesDoBanco, type CandlesDoBanco } from "../backtest/candles-historicos.js";
import { agregar } from "./agregar.js";
import { intervalosAcima, noPregaoB3, type IntervaloB3, type SimboloB3 } from "./pregao.js";

export interface OpcoesGravacao {
  /** Instante da importação: candle que ainda não fechou não entra. */
  readonly agora: number;
}

export interface ResumoGravacao {
  /** Quantos candles foram gravados (inseridos ou corrigidos) em cada intervalo. */
  readonly gravados: Partial<Record<IntervaloB3, number>>;
  readonly foraDoPregao: number;
  readonly emFormacao: number;
  readonly primeiro?: number;
  readonly ultimo?: number;
}

const LOTE = 1000;

const piso = (t: number, ms: number) => t - (((t % ms) + ms) % ms);

async function emLotes(
  banco: CandlesDoBanco,
  simbolo: SimboloB3,
  intervalo: IntervaloB3,
  lista: readonly Candle[],
): Promise<void> {
  for (let i = 0; i < lista.length; i += LOTE)
    await banco.gravar(simbolo, intervalo, lista.slice(i, i + LOTE));
}

/** Ordena, tira repetidos (vale o último lido) e acerta o fechamento pelo intervalo. */
function normalizar(lista: readonly Candle[], ms: number): Candle[] {
  const porAbertura = new Map(lista.map((k) => [k.abertura, { ...k, fechamento: k.abertura + ms - 1 }]));
  return [...porAbertura.values()].sort((a, b) => a.abertura - b.abertura);
}

/**
 * Monta os intervalos maiores (15m e 1h) a partir do que está NO BANCO no intervalo
 * importado, e não só do lote recebido: uma importação parcial (a fonte começou no meio
 * de uma hora) não sobrescreve uma hora que já estava completa. Grupo que ainda não
 * fechou em `agora` fica de fora.
 */
async function gravarAgregados(
  banco: CandlesDoBanco,
  simbolo: SimboloB3,
  intervalo: IntervaloB3,
  janela: { primeiro: number; ultimo: number },
  agora: number,
): Promise<Partial<Record<IntervaloB3, number>>> {
  const acima = intervalosAcima(intervalo);
  const maior = acima.at(-1);
  if (!maior) return {};
  const ms = MS_POR_INTERVALO[maior];
  const inicio = piso(janela.primeiro, ms);
  const fim = piso(janela.ultimo, ms) + ms;
  const base = await candlesDoBanco(banco, { simbolo, intervalo, inicio, fim });
  const gravados: Partial<Record<IntervaloB3, number>> = {};
  for (const i of acima) {
    const fechados = agregar(base, intervalo, i).filter((k) => k.fechamento < agora);
    await emLotes(banco, simbolo, i, fechados);
    gravados[i] = fechados.length;
  }
  return gravados;
}

/**
 * Grava (upsert, idempotente) candles da B3 já lidos de uma fonte: só os do pregão
 * regular e já fechados; depois monta e grava 15m e 1h. Nunca inventa candle para
 * buraco. Rodar de novo com os mesmos dados não muda nada.
 */
export async function gravarCandlesB3(
  banco: CandlesDoBanco,
  simbolo: SimboloB3,
  intervalo: IntervaloB3,
  lista: readonly Candle[],
  o: OpcoesGravacao,
): Promise<ResumoGravacao> {
  const ms = MS_POR_INTERVALO[intervalo];
  const todos = normalizar(lista, ms);
  const noPregao = todos.filter((k) => noPregaoB3(k.abertura));
  const fechados = noPregao.filter((k) => k.abertura + ms <= o.agora);
  const contagem = {
    foraDoPregao: todos.length - noPregao.length,
    emFormacao: noPregao.length - fechados.length,
  };
  const primeiro = fechados[0]?.abertura;
  const ultimo = fechados.at(-1)?.abertura;
  if (primeiro === undefined || ultimo === undefined) return { gravados: { [intervalo]: 0 }, ...contagem };
  await emLotes(banco, simbolo, intervalo, fechados);
  const agregados = await gravarAgregados(banco, simbolo, intervalo, { primeiro, ultimo }, o.agora);
  return { gravados: { [intervalo]: fechados.length, ...agregados }, ...contagem, primeiro, ultimo };
}
