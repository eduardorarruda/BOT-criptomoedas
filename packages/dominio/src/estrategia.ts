import { PERIODO_MAXIMO } from "./catalogo.js";
import type { ContextoMercado } from "./contexto.js";
import type { Valor } from "./dinheiro.js";
import { formatarNumero } from "./formatar.js";
import type { Posicao } from "./posicao.js";
import { custoIdaEVolta, precoAlvo, precoStop } from "./precos.js";
import { avaliar, validarRegra, type Regra } from "./regras.js";
import {
  distanciaDeRisco,
  stopDeEntrada,
  type Acompanhamento,
  type Empate,
  type StopAtr,
  type StopMovel,
  type TamanhoPorVolatilidade,
} from "./saidas.js";

/**
 * Percentuais em fração: 0,02 = 2%. `taxa` é a taxa da corretora por ponta.
 * `alvoLiquido` é o lucro que sobra DEPOIS das duas taxas — o bot antigo vendia a
 * qualquer preço acima da compra e pagava a taxa do próprio bolso.
 *
 * Os campos opcionais de saída mudam o stop (veja saidas.ts). Sem eles, a
 * estratégia funciona exatamente como antes. `stop` continua obrigatório: com
 * `stopAtr` ele vira o teto da distância do stop (e o plano B se faltar ATR).
 */
export interface Estrategia {
  readonly entrada: Regra;
  readonly saida?: Regra;
  readonly stop: number;
  readonly alvoLiquido: number;
  readonly taxa: number;
  /** Stop inicial em entrada − k × ATR(n), limitado pelo `stop` percentual. */
  readonly stopAtr?: StopAtr;
  /** Stop móvel: sobe com a maior máxima desde a entrada, nunca desce. */
  readonly stopMovel?: StopMovel;
  /** Break-even: depois de +gatilho, o stop vai para o preço de empate (as duas taxas pagas). */
  readonly empate?: Empate;
  /** Saída por tempo: vende depois de N candles do intervalo com a posição aberta. */
  readonly tempoMaximo?: number;
  /** Tamanho pela volatilidade: o risco por operação dividido por k × ATR(n). */
  readonly tamanhoPorVolatilidade?: TamanhoPorVolatilidade;
}

/** Os preços derivados da entrada moram em precos.ts; daqui saem para o resto do domínio. */
export { custoIdaEVolta, precoAlvo, precoEmpate, precoStop } from "./precos.js";

export interface ContextoDecisao extends ContextoMercado {
  readonly preco: Valor;
  /**
   * Estado da posição aberta (stop efetivo, máxima, candles), mantido pelo motor
   * com `atualizarStop`. Sem ele vale o stop fixo da entrada e não há saída por tempo.
   */
  readonly acompanhamento?: Acompanhamento;
}

export type MotivoVenda = "stop" | "alvo" | "regra de saída" | "tempo";

export type Sinal =
  | {
      readonly acao: "COMPRAR";
      readonly stop: Valor;
      readonly alvo: Valor;
      /** Com tamanho pela volatilidade: k × ATR(n), para o dimensionamento. */
      readonly distanciaRisco?: Valor;
      readonly explicacao: string;
    }
  | { readonly acao: "VENDER"; readonly motivo: MotivoVenda; readonly explicacao: string }
  | { readonly acao: "AGUARDAR"; readonly explicacao: string };

/**
 * Com posição aberta, nesta ordem: stop (o efetivo, se o acompanhamento o subiu),
 * alvo, regra de saída, tempo máximo; senão, aguarda. Sem posição: regra de entrada.
 */
export function decidir(e: Estrategia, ctx: ContextoDecisao, posicao: Posicao): Sinal {
  if (posicao.quantidade.gt(0)) return decidirComPosicao(e, ctx, posicao);

  const r = avaliar(e.entrada, ctx);
  if (!r.valor) return { acao: "AGUARDAR", explicacao: r.explicacao };
  const { stop, explicacao } = stopDeEntrada(e, ctx.preco, ctx);
  const distancia = distanciaDeRisco(e, ctx);
  return {
    acao: "COMPRAR",
    stop,
    alvo: precoAlvo(ctx.preco, e.alvoLiquido, e.taxa),
    ...(distancia ? { distanciaRisco: distancia } : {}),
    explicacao: explicacao ? `${r.explicacao}; ${explicacao}` : r.explicacao,
  };
}

function decidirComPosicao(e: Estrategia, ctx: ContextoDecisao, posicao: Posicao): Sinal {
  const fixo = precoStop(posicao.precoMedio, e.stop);
  const a = ctx.acompanhamento;
  const movido = a !== undefined && a.stop.gt(fixo);
  const stop = movido ? a.stop : fixo;
  const alvo = precoAlvo(posicao.precoMedio, e.alvoLiquido, e.taxa);
  const nomeStop = movido ? "stop efetivo" : "stop";
  if (ctx.preco.lte(stop)) {
    return {
      acao: "VENDER",
      motivo: "stop",
      explicacao: `preço ${formatarNumero(ctx.preco)} chegou ao ${nomeStop} ${formatarNumero(stop)}`,
    };
  }
  if (ctx.preco.gte(alvo)) {
    return {
      acao: "VENDER",
      motivo: "alvo",
      explicacao: `preço ${formatarNumero(ctx.preco)} chegou ao alvo ${formatarNumero(alvo)}`,
    };
  }
  if (e.saida) {
    const r = avaliar(e.saida, ctx);
    if (r.valor) return { acao: "VENDER", motivo: "regra de saída", explicacao: r.explicacao };
  }
  if (e.tempoMaximo !== undefined && a && a.candles >= e.tempoMaximo) {
    return {
      acao: "VENDER",
      motivo: "tempo",
      explicacao: `a posição completou ${a.candles} candles sem chegar ao alvo (limite de ${e.tempoMaximo})`,
    };
  }
  const tempo = e.tempoMaximo !== undefined && a ? `, ${a.candles} de ${e.tempoMaximo} candles` : "";
  return {
    acao: "AGUARDAR",
    explicacao: `posição aberta: ${nomeStop} em ${formatarNumero(stop)}, alvo em ${formatarNumero(alvo)}${tempo}`,
  };
}

export const MULTIPLO_ATR_MAXIMO = 20;
export const TEMPO_MAXIMO_CANDLES = 1000;

const inteiroEntre = (v: number, min: number, max: number): boolean =>
  Number.isInteger(v) && v >= min && v <= max;

/** Período e múltiplo de um uso do ATR (stop, stop móvel, tamanho). */
function problemasAtr(onde: string, p: { readonly periodo: number; readonly multiplo: number }): string[] {
  const problemas: string[] = [];
  if (!inteiroEntre(p.periodo, 1, PERIODO_MAXIMO))
    problemas.push(`o período do ATR ${onde} precisa ser inteiro entre 1 e ${PERIODO_MAXIMO}`);
  if (!(p.multiplo > 0 && p.multiplo <= MULTIPLO_ATR_MAXIMO))
    problemas.push(`o múltiplo do ATR ${onde} precisa ser maior que 0 e no máximo ${MULTIPLO_ATR_MAXIMO}`);
  return problemas;
}

function problemasSaidas(e: Estrategia): string[] {
  const problemas: string[] = [];
  if (e.stopAtr) problemas.push(...problemasAtr("do stop", e.stopAtr));
  if (e.stopMovel?.tipo === "percentual" && !(e.stopMovel.distancia > 0 && e.stopMovel.distancia < 0.5))
    problemas.push("a distância do stop móvel precisa estar entre 0% e 50%");
  if (e.stopMovel?.tipo === "atr") problemas.push(...problemasAtr("do stop móvel", e.stopMovel));
  if (e.empate) {
    const custo = custoIdaEVolta(e.taxa);
    if (!(e.empate.gatilho > custo && e.empate.gatilho < 1))
      problemas.push(
        `o gatilho do empate precisa ser maior que o custo das duas taxas (${formatarNumero(custo * 100)}%) e menor que 100%`,
      );
  }
  if (e.tempoMaximo !== undefined && !inteiroEntre(e.tempoMaximo, 1, TEMPO_MAXIMO_CANDLES))
    problemas.push(
      `o tempo máximo precisa ser um número inteiro de candles entre 1 e ${TEMPO_MAXIMO_CANDLES}`,
    );
  if (e.tamanhoPorVolatilidade) problemas.push(...problemasAtr("do tamanho", e.tamanhoPorVolatilidade));
  return problemas;
}

export function validarEstrategia(e: Estrategia): string[] {
  const problemas = [...validarRegra(e.entrada), ...(e.saida ? validarRegra(e.saida) : [])];
  if (!(e.stop > 0 && e.stop < 0.5)) problemas.push("o stop precisa estar entre 0% e 50%");
  if (!(e.alvoLiquido > 0 && e.alvoLiquido < 1))
    problemas.push("o alvo líquido precisa ser maior que 0% e menor que 100%");
  if (!(e.taxa >= 0 && e.taxa < 0.01)) problemas.push("a taxa precisa estar entre 0% e 1%");
  return [...problemas, ...problemasSaidas(e)];
}
