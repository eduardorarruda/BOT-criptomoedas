import { MS_POR_INTERVALO } from "@zentrade/contratos";
import type { LoteCandles } from "@zentrade/banco";
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

/** Só o pregão regular e o que já fechou em `agora`, em ordem e sem aberturas repetidas. */
function filtrarParaGravar(lista: readonly Candle[], intervalo: IntervaloB3, agora: number) {
  const ms = MS_POR_INTERVALO[intervalo];
  const todos = normalizar(lista, ms);
  const noPregao = todos.filter((k) => noPregaoB3(k.abertura));
  const fechados = noPregao.filter((k) => k.abertura + ms <= agora);
  return {
    fechados,
    foraDoPregao: todos.length - noPregao.length,
    emFormacao: noPregao.length - fechados.length,
  };
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
  const { fechados, ...contagem } = filtrarParaGravar(lista, intervalo, o.agora);
  const primeiro = fechados[0]?.abertura;
  const ultimo = fechados.at(-1)?.abertura;
  if (primeiro === undefined || ultimo === undefined) return { gravados: { [intervalo]: 0 }, ...contagem };
  await emLotes(banco, simbolo, intervalo, fechados);
  const agregados = await gravarAgregados(banco, simbolo, intervalo, { primeiro, ultimo }, o.agora);
  return { gravados: { [intervalo]: fechados.length, ...agregados }, ...contagem, primeiro, ultimo };
}

export interface Trecho {
  readonly inicio: number;
  readonly fim: number;
}

/** O banco de candles que também troca um trecho inteiro (o repositório de mercado de packages/banco). */
export interface CandlesSubstituiveis extends CandlesDoBanco {
  /**
   * Numa transação só: apaga o que há em [inicio, fim) nos intervalos dos lotes e grava
   * os lotes. Devolve quantos candles antigos foram apagados.
   */
  substituir(simbolo: string, trecho: Trecho, lotes: readonly LoteCandles[]): Promise<number>;
}

/**
 * Troca tudo o que há no trecho [inicio, fim) pelo lote, no intervalo importado e nos
 * maiores (15m e 1h, montados aqui a partir do lote), numa transação só: se algo falhar
 * no meio, o banco fica como estava. Para a fonte que manda o pregão inteiro de uma vez
 * (o arquivo de negócios da B3): reimportar o dia fica igual, e candle que não existe
 * mais na fonte some. Mesmos filtros de `gravarCandlesB3` (pregão regular, já fechado).
 * O trecho precisa estar na grade do maior intervalo (meia-noite de Brasília está) e
 * conter todo o lote.
 */
export async function substituirCandlesB3(
  banco: CandlesSubstituiveis,
  simbolo: SimboloB3,
  intervalo: IntervaloB3,
  trecho: Trecho,
  lista: readonly Candle[],
  o: OpcoesGravacao,
): Promise<ResumoGravacao & { readonly apagados: number }> {
  const acima = intervalosAcima(intervalo);
  const maior = acima.at(-1) ?? intervalo;
  const msMaior = MS_POR_INTERVALO[maior];
  if (piso(trecho.inicio, msMaior) !== trecho.inicio || piso(trecho.fim, msMaior) !== trecho.fim)
    throw new RangeError(`o trecho a substituir precisa estar na grade de ${maior}`);
  if (lista.some((k) => k.abertura < trecho.inicio || k.abertura >= trecho.fim))
    throw new RangeError("há candle fora do trecho a substituir");
  const { fechados, ...contagem } = filtrarParaGravar(lista, intervalo, o.agora);
  const lotes: LoteCandles[] = [
    { intervalo, lista: fechados },
    ...acima.map((i) => ({
      intervalo: i,
      lista: agregar(fechados, intervalo, i).filter((k) => k.fechamento < o.agora),
    })),
  ];
  const apagados = await banco.substituir(simbolo, trecho, lotes);
  const gravados = Object.fromEntries(lotes.map((l) => [l.intervalo, l.lista.length]));
  const primeiro = fechados[0]?.abertura;
  const ultimo = fechados.at(-1)?.abertura;
  return {
    gravados,
    ...contagem,
    ...(primeiro === undefined ? {} : { primeiro }),
    ...(ultimo === undefined ? {} : { ultimo }),
    apagados,
  };
}
