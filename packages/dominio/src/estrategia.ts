import { dec, type Valor } from "./dinheiro.js";
import { formatarNumero } from "./formatar.js";
import type { Posicao } from "./posicao.js";
import { avaliar, validarRegra, type Regra } from "./regras.js";

/**
 * Percentuais em fração: 0,02 = 2%. `taxa` é a taxa da corretora por ponta.
 * `alvoLiquido` é o lucro que sobra DEPOIS das duas taxas — o bot antigo vendia a
 * qualquer preço acima da compra e pagava a taxa do próprio bolso.
 */
export interface Estrategia {
  readonly entrada: Regra;
  readonly saida?: Regra;
  readonly stop: number;
  readonly alvoLiquido: number;
  readonly taxa: number;
}

export interface ContextoDecisao {
  readonly fechamentos: readonly number[];
  readonly preco: Valor;
}

export type Sinal =
  | { readonly acao: "COMPRAR"; readonly stop: Valor; readonly alvo: Valor; readonly explicacao: string }
  | {
      readonly acao: "VENDER";
      readonly motivo: "stop" | "alvo" | "regra de saída";
      readonly explicacao: string;
    }
  | { readonly acao: "AGUARDAR"; readonly explicacao: string };

/** Preço de venda que deixa exatamente `alvoLiquido` de lucro depois da taxa de compra e de venda. */
export function precoAlvo(entrada: Valor, alvoLiquido: number, taxa: number): Valor {
  return entrada.times(dec(1).plus(taxa)).times(dec(1).plus(alvoLiquido)).div(dec(1).minus(taxa));
}

export const precoStop = (entrada: Valor, stop: number): Valor => entrada.times(dec(1).minus(stop));

export function decidir(e: Estrategia, ctx: ContextoDecisao, posicao: Posicao): Sinal {
  if (posicao.quantidade.gt(0)) {
    const stop = precoStop(posicao.precoMedio, e.stop);
    const alvo = precoAlvo(posicao.precoMedio, e.alvoLiquido, e.taxa);
    if (ctx.preco.lte(stop)) {
      return {
        acao: "VENDER",
        motivo: "stop",
        explicacao: `preço ${formatarNumero(ctx.preco)} chegou ao stop ${formatarNumero(stop)}`,
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
    return {
      acao: "AGUARDAR",
      explicacao: `posição aberta: stop em ${formatarNumero(stop)}, alvo em ${formatarNumero(alvo)}`,
    };
  }

  const r = avaliar(e.entrada, ctx);
  if (!r.valor) return { acao: "AGUARDAR", explicacao: r.explicacao };
  return {
    acao: "COMPRAR",
    stop: precoStop(ctx.preco, e.stop),
    alvo: precoAlvo(ctx.preco, e.alvoLiquido, e.taxa),
    explicacao: r.explicacao,
  };
}

export function validarEstrategia(e: Estrategia): string[] {
  const problemas = [...validarRegra(e.entrada), ...(e.saida ? validarRegra(e.saida) : [])];
  if (!(e.stop > 0 && e.stop < 0.5)) problemas.push("o stop precisa estar entre 0% e 50%");
  if (!(e.alvoLiquido > 0 && e.alvoLiquido < 1))
    problemas.push("o alvo líquido precisa ser maior que 0% e menor que 100%");
  if (!(e.taxa >= 0 && e.taxa < 0.01)) problemas.push("a taxa precisa estar entre 0% e 1%");
  return problemas;
}
