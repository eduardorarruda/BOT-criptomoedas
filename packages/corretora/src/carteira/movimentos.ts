import { dec, type Valor } from "@zentrade/dominio";
import { USDT, type Movimento, type Negociacao } from "./tipos.js";

interface ParTaxa {
  readonly preco: Valor;
  readonly base: string;
  readonly cotacao: string;
}

interface TaxaPaga extends ParTaxa {
  readonly taxa: Valor;
  readonly ativoTaxa: string;
}

/**
 * A taxa paga em USDT, pelo preço do instante da negociação:
 * - em USDT: ela mesma;
 * - na moeda base: taxa × preço da negociação × cotação em USDT;
 * - na moeda de cotação: taxa × cotação em USDT;
 * - em outra moeda (BNB): taxa × preço dessa moeda em USDT no instante.
 * Sem preço para converter, devolve null: a taxa é desconhecida, nunca zero.
 */
export function taxaEmUsdt(
  n: TaxaPaga,
  cotacaoUsdt: Valor | null,
  precoAtivoTaxaUsdt: Valor | null,
): Valor | null {
  if (n.taxa.isZero() || n.ativoTaxa === USDT) return n.taxa;
  if (n.ativoTaxa === n.base) return cotacaoUsdt ? n.taxa.times(n.preco).times(cotacaoUsdt) : null;
  if (n.ativoTaxa === n.cotacao) return cotacaoUsdt ? n.taxa.times(cotacaoUsdt) : null;
  return precoAtivoTaxaUsdt ? n.taxa.times(precoAtivoTaxaUsdt) : null;
}

/** Moedas cujo preço em USDT no instante é preciso buscar para converter a negociação. */
export function ativosParaConverter(n: {
  readonly base: string;
  readonly cotacao: string;
  readonly ativoTaxa: string;
}): string[] {
  const cotacao = n.cotacao === USDT ? [] : [n.cotacao];
  const taxa = [USDT, n.base, n.cotacao].includes(n.ativoTaxa) ? [] : [n.ativoTaxa];
  return [...cotacao, ...taxa];
}

const seMesmo = (ativo: string, n: Negociacao): Valor => (n.ativoTaxa === ativo ? n.taxa : dec(0));

function pernaBase(n: Negociacao): Movimento | null {
  if (n.base === USDT) return null;
  const compra = n.lado === "COMPRA";
  // Na compra a taxa na base sai do que se recebe; na venda, sai junto com o vendido.
  const quantidade = compra ? n.quantidade.minus(seMesmo(n.base, n)) : n.quantidade.plus(seMesmo(n.base, n));
  return {
    ativo: n.base,
    tipo: compra ? "compra" : "venda",
    quantidade,
    precoUsdt: n.cotacaoUsdt ? n.preco.times(n.cotacaoUsdt) : null,
    taxaUsdt: n.taxaUsdt,
    origem: n.origem,
    em: n.em,
    negociacaoId: n.id,
  };
}

/** O outro lado: comprar ETH com BTC é vender BTC (e vice-versa). USDT é a referência e não tem perna. */
function pernaCotacao(n: Negociacao): Movimento | null {
  if (n.cotacao === USDT) return null;
  const compraBase = n.lado === "COMPRA";
  const taxa = seMesmo(n.cotacao, n);
  return {
    ativo: n.cotacao,
    tipo: compraBase ? "venda" : "compra",
    quantidade: compraBase ? n.valorCotacao.plus(taxa) : n.valorCotacao.minus(taxa),
    precoUsdt: n.cotacaoUsdt,
    // A taxa conta uma vez só: na perna da base, ou aqui quando a base é a referência.
    taxaUsdt: n.base === USDT ? n.taxaUsdt : dec(0),
    origem: n.origem,
    em: n.em,
    negociacaoId: n.id,
  };
}

/** Taxa paga numa terceira moeda (BNB): a moeda sai pelo custo médio, sem resultado próprio. */
function pernaTaxa(n: Negociacao): Movimento | null {
  if ([USDT, n.base, n.cotacao].includes(n.ativoTaxa) || n.taxa.isZero()) return null;
  return {
    ativo: n.ativoTaxa,
    tipo: "taxa",
    quantidade: n.taxa,
    precoUsdt: n.taxaUsdt ? n.taxaUsdt.div(n.taxa) : null,
    taxaUsdt: dec(0),
    origem: n.origem,
    em: n.em,
    negociacaoId: n.id,
  };
}

/** O efeito de uma negociação em cada moeda que ela toca. */
export function movimentosDe(n: Negociacao): Movimento[] {
  return [pernaBase(n), pernaCotacao(n), pernaTaxa(n)].filter(
    (m): m is Movimento => m !== null && m.quantidade.gt(0),
  );
}
