import type { CompraExecutada } from "@zentrade/contratos";
import {
  atualizarStop,
  decidir,
  iniciarAcompanhamento,
  type Acompanhamento,
  type ContextoMercado,
  type Estrategia,
  type Posicao,
  type Sinal,
  type Valor,
} from "@zentrade/dominio";
import { ajusteDaPosicao } from "../nucleo/protecao.js";
import { niveisDaPosicao, type NiveisSaida } from "./intrabar.js";

/**
 * A posição aberta do backtest, como o robô a acompanha: a estratégia EFETIVA (stop e
 * alvo acertados na compra — é aí que o stop por ATR fica valendo) e o acompanhamento
 * do domínio (stop móvel, empate, candles desde a entrada para a saída por tempo).
 *
 * Por candle FECHADO com a posição aberta: `atualizarStop`; o stop novo só vale a partir
 * da vigia intrabar do candle SEGUINTE. A saída por tempo sai de `decidir` no fechamento.
 */
export interface PosicaoAcompanhada {
  readonly efetiva: Estrategia;
  readonly acompanhamento: Acompanhamento;
}

/** A estratégia da posição: a do robô com o stop/alvo efetivos da compra (como PosicaoAberta faz). */
export function estrategiaEfetiva(e: Estrategia, compra: CompraExecutada | null): Estrategia {
  if (!compra?.protecao) return e;
  return { ...e, ...ajusteDaPosicao(compra.protecao, compra.preco, e.taxa) };
}

export function iniciar(e: Estrategia, compra: CompraExecutada | null, posicao: Posicao): PosicaoAcompanhada {
  const efetiva = estrategiaEfetiva(e, compra);
  return { efetiva, acompanhamento: iniciarAcompanhamento(efetiva, posicao) };
}

/** Só estas saídas precisam do acompanhamento candle a candle. */
export const precisaAcompanhar = (e: Estrategia): boolean =>
  Boolean(e.stopMovel || e.empate || e.tempoMaximo !== undefined);

/** Stop (o maior entre o da compra e o acompanhado) e alvo para a vigia intrabar. */
export function niveisEfetivos(posicao: Posicao, p: PosicaoAcompanhada): NiveisSaida {
  const base = niveisDaPosicao(posicao.precoMedio, p.efetiva);
  const stop = p.acompanhamento.stop.gt(base.stop) ? p.acompanhamento.stop : base.stop;
  return { stop, alvo: base.alvo };
}

/**
 * Fechou um candle com a posição aberta: sobe o stop se o stop móvel ou o empate pedirem
 * e pergunta ao `decidir` com o acompanhamento. Vende no fechamento por tempo ou se o
 * stop novo já ficou acima do fechamento (o candle subiu e voltou) — o domínio manda
 * vender por stop nesse caso. Alvo e regra de saída o núcleo já viu no mesmo fechamento.
 */
export function aoFecharComPosicao(
  p: PosicaoAcompanhada,
  ctx: ContextoMercado,
  preco: Valor,
  posicao: Posicao,
): {
  readonly posicao: PosicaoAcompanhada;
  readonly saida: Extract<Sinal, { acao: "VENDER" }> | null;
} {
  const acompanhamento = atualizarStop(p.efetiva, p.acompanhamento, ctx).acompanhamento;
  const proxima = { ...p, acompanhamento };
  const sinal = decidir(p.efetiva, { ...ctx, preco, acompanhamento }, posicao);
  return {
    posicao: proxima,
    saida: sinal.acao === "VENDER" && (sinal.motivo === "tempo" || sinal.motivo === "stop") ? sinal : null,
  };
}

/** Recorte [de, ate) de um contexto já convertido (o tamanho do histórico do robô). */
export function contextoEntre(ctx: ContextoMercado, de: number, ate: number): ContextoMercado {
  const cortar = (s: readonly number[] | undefined) => s?.slice(de, ate);
  const aberturas = cortar(ctx.aberturas);
  const maximas = cortar(ctx.maximas);
  const minimas = cortar(ctx.minimas);
  const volumes = cortar(ctx.volumes);
  const instantes = cortar(ctx.instantes);
  return {
    fechamentos: ctx.fechamentos.slice(de, ate),
    ...(aberturas ? { aberturas } : {}),
    ...(maximas ? { maximas } : {}),
    ...(minimas ? { minimas } : {}),
    ...(volumes ? { volumes } : {}),
    ...(instantes ? { instantes } : {}),
    ...(ctx.intervaloMs !== undefined ? { intervaloMs: ctx.intervaloMs } : {}),
    ...(ctx.fuso ? { fuso: ctx.fuso } : {}),
  };
}
