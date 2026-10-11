import type { ParcelaCarteira, ResumoParcela } from "@zentrade/contratos";
import { dec, paraTexto, type Valor } from "@zentrade/dominio";
import { precoMedioDe, type Livro } from "./livro.js";

/** Dinheiro sai com até 18 casas (a escala do NUMERIC do banco); frações, com 10. */
export const dinheiro = (v: Valor): string => paraTexto(v.toDecimalPlaces(18));
export const fracao = (v: Valor): string => paraTexto(v.toDecimalPlaces(10));
const opcional = (v: Valor | null, f = dinheiro): string | null => (v === null ? null : f(v));

const ZERO = dec(0);

/** Os números de uma parcela, ainda em decimal, para somar no resumo. */
export interface ValoresParcela {
  readonly livro: Livro;
  readonly valorAtual: Valor | null;
  readonly naoRealizado: Valor | null;
  readonly realizadoLiquido: Valor;
  readonly liquido: Valor | null;
}

const retornoDe = (liquido: Valor | null, custoComprado: Valor): Valor | null =>
  liquido === null || custoComprado.isZero() ? null : liquido.div(custoComprado);

/** Posição zerada vale zero mesmo sem preço; com posição e sem preço, o valor é desconhecido. */
export function valoresDe(livro: Livro, preco: Valor | null): ValoresParcela {
  const valorAtual = livro.quantidade.isZero() ? ZERO : preco ? livro.quantidade.times(preco) : null;
  const naoRealizado = valorAtual === null ? null : valorAtual.minus(livro.custoPosicao);
  const realizadoLiquido = livro.realizadoBruto.minus(livro.taxas);
  const liquido = naoRealizado === null ? null : realizadoLiquido.plus(naoRealizado);
  return { livro, valorAtual, naoRealizado, realizadoLiquido, liquido };
}

export function parcelaDto(v: ValoresParcela): ParcelaCarteira {
  const l = v.livro;
  return {
    quantidadeComprada: dinheiro(l.quantidadeComprada),
    custoComprado: dinheiro(l.custoComprado),
    quantidadeVendida: dinheiro(l.quantidadeVendida),
    valorVendido: dinheiro(l.valorVendido),
    quantidade: dinheiro(l.quantidade),
    precoMedio: opcional(precoMedioDe(l)),
    custoPosicao: dinheiro(l.custoPosicao),
    valorAtual: opcional(v.valorAtual),
    resultadoRealizadoBruto: dinheiro(l.realizadoBruto),
    resultadoRealizadoLiquido: dinheiro(v.realizadoLiquido),
    resultadoNaoRealizado: opcional(v.naoRealizado),
    resultadoLiquido: opcional(v.liquido),
    taxas: dinheiro(l.taxas),
    retorno: opcional(retornoDe(v.liquido, l.custoComprado), fracao),
    quantidadeVendidaSemCusto: dinheiro(l.vendidoSemCusto),
    negociacoes: l.negociacoes,
    semConversao: l.semConversao,
  };
}

/**
 * Soma das moedas numa parcela. O que não tem preço (valor e resultado não realizado
 * desconhecidos) fica fora das somas de valor; quem chama avisa quais moedas são.
 */
export function resumoParcela(valores: readonly ValoresParcela[]): ResumoParcela {
  const somar = (f: (v: ValoresParcela) => Valor | null): Valor =>
    valores.reduce((t, v) => t.plus(f(v) ?? ZERO), ZERO);
  const bruto = somar((v) => v.livro.realizadoBruto);
  const liquidoRealizado = somar((v) => v.realizadoLiquido);
  const naoRealizado = somar((v) => v.naoRealizado);
  const custoComprado = somar((v) => v.livro.custoComprado);
  const liquido = liquidoRealizado.plus(naoRealizado);
  return {
    custoComprado: dinheiro(custoComprado),
    custoPosicao: dinheiro(somar((v) => v.livro.custoPosicao)),
    valorAtual: dinheiro(somar((v) => v.valorAtual)),
    resultadoRealizadoBruto: dinheiro(bruto),
    resultadoRealizadoLiquido: dinheiro(liquidoRealizado),
    resultadoNaoRealizado: dinheiro(naoRealizado),
    resultadoBruto: dinheiro(bruto.plus(naoRealizado)),
    resultadoLiquido: dinheiro(liquido),
    taxas: dinheiro(somar((v) => v.livro.taxas)),
    retorno: opcional(retornoDe(liquido, custoComprado), fracao),
  };
}
