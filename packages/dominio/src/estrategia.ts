import { PERIODO_MAXIMO } from "./catalogo.js";
import type { ContextoMercado } from "./contexto.js";
import type { Valor } from "./dinheiro.js";
import { formatarNumero } from "./formatar.js";
import type { Posicao } from "./posicao.js";
import { custoIdaEVolta, precoAlvo, precoStop } from "./precos.js";
import { avaliar, validarRegra, type Regra } from "./regras.js";
import { contra, DIRECOES, direcaoDe, sentidosDa, aFavor, type Direcao, type Sentido } from "./sentido.js";
import {
  distanciaDeRisco,
  stopDeEntrada,
  type Acompanhamento,
  type Empate,
  type StopAtr,
  type StopMovel,
  type TamanhoPorAlocacao,
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
  /** Tamanho por alocação: fração × exposição máxima, sem olhar o risco por operação (o cofre de tendência). */
  readonly tamanhoPorAlocacao?: TamanhoPorAlocacao;
  /**
   * Para que lado abrir posição. Sem ele, "comprado" — o único lado do à vista de
   * cripto, onde o robô e o backtest recusam as outras direções. Com "vendido" ou
   * "ambos" (mercados futuros, como o mini índice), vale `entradaVendida`; com
   * "vendido", a `entrada` (de compra) fica guardada, mas não é usada.
   */
  readonly direcao?: Direcao;
  /** Quando abrir uma venda a descoberto. Obrigatória com direção "vendido" ou "ambos". */
  readonly entradaVendida?: Regra;
  /** Saída antecipada da posição vendida (o espelho de `saida`). */
  readonly saidaVendida?: Regra;
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
 *
 * É o caminho do à vista de cripto: só compra. Uma estratégia com outra direção não
 * abre posição aqui (o mercado à vista não tem venda a descoberto); ela roda no
 * backtest do mini índice, por `decidirComSentido`.
 */
export function decidir(e: Estrategia, ctx: ContextoDecisao, posicao: Posicao): Sinal {
  if (posicao.quantidade.gt(0)) {
    const s = decidirAberta(e, ctx, posicao.precoMedio, "comprado");
    return s.acao === "SAIR" ? { acao: "VENDER", motivo: s.motivo, explicacao: s.explicacao } : s;
  }
  if (direcaoDe(e) !== "comprado")
    return {
      acao: "AGUARDAR",
      explicacao: `a estratégia opera ${direcaoDe(e) === "vendido" ? "vendida" : "nos dois sentidos"}; no mercado à vista o robô só compra`,
    };
  const r = avaliar(e.entrada, ctx);
  if (!r.valor) return { acao: "AGUARDAR", explicacao: r.explicacao };
  const { stop, alvo, distanciaRisco, explicacao } = abertura(e, ctx, "comprado");
  return {
    acao: "COMPRAR",
    stop,
    alvo,
    ...(distanciaRisco ? { distanciaRisco } : {}),
    explicacao: explicacao ? `${r.explicacao}; ${explicacao}` : r.explicacao,
  };
}

function abertura(e: Estrategia, ctx: ContextoDecisao, sentido: Sentido) {
  const { stop, explicacao } = stopDeEntrada(e, ctx.preco, ctx, sentido);
  return {
    stop,
    alvo: precoAlvo(ctx.preco, e.alvoLiquido, e.taxa, sentido),
    distanciaRisco: distanciaDeRisco(e, ctx),
    explicacao,
  };
}

type Aberta =
  | { readonly acao: "SAIR"; readonly motivo: MotivoVenda; readonly explicacao: string }
  | { readonly acao: "AGUARDAR"; readonly explicacao: string };

/** A posição aberta no sentido dado: stop, alvo, regra de saída do lado, tempo. */
function decidirAberta(e: Estrategia, ctx: ContextoDecisao, entrada: Valor, sentido: Sentido): Aberta {
  const fixo = precoStop(entrada, e.stop, sentido);
  const a = ctx.acompanhamento;
  const movido = a !== undefined && !aFavor(fixo, a.stop, sentido);
  const stop = movido ? a.stop : fixo;
  const alvo = precoAlvo(entrada, e.alvoLiquido, e.taxa, sentido);
  const nomeStop = movido ? "stop efetivo" : "stop";
  if (contra(ctx.preco, stop, sentido)) {
    return {
      acao: "SAIR",
      motivo: "stop",
      explicacao: `preço ${formatarNumero(ctx.preco)} chegou ao ${nomeStop} ${formatarNumero(stop)}`,
    };
  }
  if (aFavor(ctx.preco, alvo, sentido)) {
    return {
      acao: "SAIR",
      motivo: "alvo",
      explicacao: `preço ${formatarNumero(ctx.preco)} chegou ao alvo ${formatarNumero(alvo)}`,
    };
  }
  const saida = sentido === "comprado" ? e.saida : e.saidaVendida;
  if (saida) {
    const r = avaliar(saida, ctx);
    if (r.valor) return { acao: "SAIR", motivo: "regra de saída", explicacao: r.explicacao };
  }
  if (e.tempoMaximo !== undefined && a && a.candles >= e.tempoMaximo) {
    return {
      acao: "SAIR",
      motivo: "tempo",
      explicacao: `a posição completou ${a.candles} candles sem chegar ao alvo (limite de ${e.tempoMaximo})`,
    };
  }
  const tempo = e.tempoMaximo !== undefined && a ? `, ${a.candles} de ${e.tempoMaximo} candles` : "";
  const lado = sentido === "vendido" ? "posição vendida aberta" : "posição aberta";
  return {
    acao: "AGUARDAR",
    explicacao: `${lado}: ${nomeStop} em ${formatarNumero(stop)}, alvo em ${formatarNumero(alvo)}${tempo}`,
  };
}

/** A posição aberta de um mercado com os dois lados (mini índice): o sentido e o preço de entrada. */
export interface PosicaoComSentido {
  readonly sentido: Sentido;
  readonly precoMedio: Valor;
}

export type SinalComSentido =
  | {
      readonly acao: "ABRIR";
      readonly sentido: Sentido;
      readonly stop: Valor;
      readonly alvo: Valor;
      /** Com tamanho pela volatilidade: k × ATR(n), para o dimensionamento. */
      readonly distanciaRisco?: Valor;
      readonly explicacao: string;
    }
  | { readonly acao: "ZERAR"; readonly motivo: MotivoVenda; readonly explicacao: string }
  | { readonly acao: "AGUARDAR"; readonly explicacao: string };

/**
 * A decisão nos mercados com os dois lados. Com posição aberta, as mesmas regras de
 * `decidir`, espelhadas no vendido (stop acima, alvo abaixo, `saidaVendida`). Sem
 * posição, avalia a entrada de cada sentido que a direção permite; se as duas dizem
 * sim no mesmo candle, fica de fora (sinal contraditório não abre posição).
 */
export function decidirComSentido(
  e: Estrategia,
  ctx: ContextoDecisao,
  aberta: PosicaoComSentido | null,
): SinalComSentido {
  if (aberta) {
    const s = decidirAberta(e, ctx, aberta.precoMedio, aberta.sentido);
    return s.acao === "SAIR" ? { acao: "ZERAR", motivo: s.motivo, explicacao: s.explicacao } : s;
  }
  const avaliados = sentidosDa(direcaoDe(e)).map((sentido) => {
    const regra = sentido === "comprado" ? e.entrada : e.entradaVendida;
    const r = regra ? avaliar(regra, ctx) : { valor: false, explicacao: "sem regra de entrada vendida" };
    return { sentido, ...r, explicacao: `${sentido === "comprado" ? "compra" : "venda"}: ${r.explicacao}` };
  });
  const sim = avaliados.filter((a) => a.valor);
  if (sim.length > 1)
    return {
      acao: "AGUARDAR",
      explicacao: `as regras de compra e de venda deram sim no mesmo candle: fica de fora (${sim.map((s) => s.explicacao).join("; ")})`,
    };
  const escolhido = sim[0];
  if (!escolhido) return { acao: "AGUARDAR", explicacao: avaliados.map((a) => a.explicacao).join("; ") };
  const { stop, alvo, distanciaRisco, explicacao } = abertura(e, ctx, escolhido.sentido);
  return {
    acao: "ABRIR",
    sentido: escolhido.sentido,
    stop,
    alvo,
    ...(distanciaRisco ? { distanciaRisco } : {}),
    explicacao: explicacao ? `${escolhido.explicacao}; ${explicacao}` : escolhido.explicacao,
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
  if (e.tamanhoPorAlocacao) {
    if (!(e.tamanhoPorAlocacao.fracao > 0 && e.tamanhoPorAlocacao.fracao <= 1))
      problemas.push("a fração da alocação precisa ser maior que 0% e no máximo 100% da exposição máxima");
    if (e.tamanhoPorVolatilidade)
      problemas.push("use um só jeito de definir o tamanho: pela volatilidade ou por alocação");
  }
  return problemas;
}

/** A direção e as regras do lado vendido. */
function problemasDirecao(e: Estrategia): string[] {
  if (e.direcao !== undefined && !DIRECOES.includes(e.direcao))
    return ["a direção precisa ser comprado, vendido ou ambos"];
  const vende = direcaoDe(e) !== "comprado";
  const problemas: string[] = [];
  if (vende && !e.entradaVendida)
    problemas.push("com a direção vendido ou ambos, a estratégia precisa da regra de entrada vendida");
  if (!vende && (e.entradaVendida || e.saidaVendida))
    problemas.push("as regras do lado vendido só valem com a direção vendido ou ambos");
  if (e.entradaVendida) problemas.push(...validarRegra(e.entradaVendida));
  if (e.saidaVendida) problemas.push(...validarRegra(e.saidaVendida));
  return problemas;
}

export function validarEstrategia(e: Estrategia): string[] {
  const problemas = [
    ...validarRegra(e.entrada),
    ...(e.saida ? validarRegra(e.saida) : []),
    ...problemasDirecao(e),
  ];
  if (!(e.stop > 0 && e.stop < 0.5)) problemas.push("o stop precisa estar entre 0% e 50%");
  if (!(e.alvoLiquido > 0 && e.alvoLiquido < 1))
    problemas.push("o alvo líquido precisa ser maior que 0% e menor que 100%");
  if (!(e.taxa >= 0 && e.taxa < 0.01)) problemas.push("a taxa precisa estar entre 0% e 1%");
  return [...new Set([...problemas, ...problemasSaidas(e)])];
}
