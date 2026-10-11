import { dec, type Valor } from "@zentrade/dominio";
import type { Movimento } from "./tipos.js";

/**
 * Livro de uma moeda numa parcela (robô, manual ou total), em USDT.
 *
 * Método de custo: preço médio ponderado, o mesmo da posição do domínio. Cada compra
 * soma quantidade × preço ao custo da posição; cada venda tira do custo a fração
 * vendida (custo × vendido ÷ quantidade) e realiza a diferença para o preço de venda.
 * O resultado realizado bruto não desconta taxas; o líquido é bruto − taxas (todas,
 * de compra e de venda, como no domínio). Venda além da quantidade conhecida não tem
 * custo: entra no vendido, mas não no resultado.
 */
export interface Livro {
  readonly quantidadeComprada: Valor;
  readonly custoComprado: Valor;
  readonly quantidadeVendida: Valor;
  readonly valorVendido: Valor;
  readonly quantidade: Valor;
  readonly custoPosicao: Valor;
  readonly realizadoBruto: Valor;
  readonly taxas: Valor;
  readonly vendidoSemCusto: Valor;
  readonly negociacoes: number;
  readonly semConversao: number;
  readonly taxasSemConversao: number;
}

const ZERO = dec(0);

export const LIVRO_VAZIO: Livro = Object.freeze({
  quantidadeComprada: ZERO,
  custoComprado: ZERO,
  quantidadeVendida: ZERO,
  valorVendido: ZERO,
  quantidade: ZERO,
  custoPosicao: ZERO,
  realizadoBruto: ZERO,
  taxas: ZERO,
  vendidoSemCusto: ZERO,
  negociacoes: 0,
  semConversao: 0,
  taxasSemConversao: 0,
});

export const precoMedioDe = (l: Livro): Valor | null =>
  l.quantidade.isZero() ? null : l.custoPosicao.div(l.quantidade);

/** Tira `quantidade` da posição pelo custo médio. Devolve o livro novo e o custo que saiu. */
function retirar(l: Livro, quantidade: Valor): { livro: Livro; coberta: Valor; custo: Valor } {
  const coberta = menor(quantidade, l.quantidade);
  if (coberta.isZero()) return { livro: l, coberta, custo: ZERO };
  const resta = l.quantidade.minus(coberta);
  // Ao zerar, o custo vai a zero exato (sem resto de divisão).
  const custo = resta.isZero() ? l.custoPosicao : l.custoPosicao.times(coberta).div(l.quantidade);
  return { livro: { ...l, quantidade: resta, custoPosicao: l.custoPosicao.minus(custo) }, coberta, custo };
}

function menor(a: Valor, b: Valor): Valor {
  return a.lte(b) ? a : b;
}

function comTaxa(l: Livro, taxa: Valor | null): Livro {
  if (taxa === null) return { ...l, taxasSemConversao: l.taxasSemConversao + 1 };
  return { ...l, taxas: l.taxas.plus(taxa) };
}

function comprar(l: Livro, m: Movimento, preco: Valor): Livro {
  const custo = m.quantidade.times(preco);
  return comTaxa(
    {
      ...l,
      quantidadeComprada: l.quantidadeComprada.plus(m.quantidade),
      custoComprado: l.custoComprado.plus(custo),
      quantidade: l.quantidade.plus(m.quantidade),
      custoPosicao: l.custoPosicao.plus(custo),
      negociacoes: l.negociacoes + 1,
    },
    m.taxaUsdt,
  );
}

function vender(l: Livro, m: Movimento, preco: Valor): Livro {
  const { livro, coberta, custo } = retirar(l, m.quantidade);
  return comTaxa(
    {
      ...livro,
      quantidadeVendida: l.quantidadeVendida.plus(m.quantidade),
      valorVendido: l.valorVendido.plus(m.quantidade.times(preco)),
      realizadoBruto: l.realizadoBruto.plus(coberta.times(preco).minus(custo)),
      vendidoSemCusto: l.vendidoSemCusto.plus(m.quantidade.minus(coberta)),
      negociacoes: l.negociacoes + 1,
    },
    m.taxaUsdt,
  );
}

export function aplicarMovimento(l: Livro, m: Movimento): Livro {
  // Moeda gasta em taxa: o valor dela já foi contado como taxa na outra negociação.
  if (m.tipo === "taxa") return retirar(l, m.quantidade).livro;
  if (m.precoUsdt === null) return { ...l, semConversao: l.semConversao + 1 };
  return m.tipo === "compra" ? comprar(l, m, m.precoUsdt) : vender(l, m, m.precoUsdt);
}

/** Aplica na ordem do tempo (quem chama ordena). */
export const livroDe = (movimentos: readonly Movimento[]): Livro =>
  movimentos.reduce(aplicarMovimento, LIVRO_VAZIO);
