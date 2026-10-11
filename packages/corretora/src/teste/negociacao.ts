import { dec } from "@zentrade/dominio";
import type { Negociacao } from "../carteira/tipos.js";

/** Negociação de teste: par BTCUSDT, compra manual, taxa em USDT, salvo o que for trocado. Só para testes. */
export interface NegociacaoTeste {
  readonly id?: string;
  readonly simbolo?: string;
  readonly base?: string;
  readonly cotacao?: string;
  readonly lado?: "COMPRA" | "VENDA";
  readonly preco: string;
  readonly quantidade: string;
  readonly taxa?: string;
  readonly ativoTaxa?: string;
  readonly cotacaoUsdt?: string | null;
  readonly taxaUsdt?: string | null;
  readonly origem?: "robo" | "manual";
  readonly em?: number;
}

let sequencia = 0;

export function negociacao(n: NegociacaoTeste): Negociacao {
  sequencia += 1;
  const base = n.base ?? "BTC";
  const cotacao = n.cotacao ?? "USDT";
  const preco = dec(n.preco);
  const quantidade = dec(n.quantidade);
  const taxa = dec(n.taxa ?? "0");
  const cotacaoUsdt =
    n.cotacaoUsdt === undefined ? dec(1) : n.cotacaoUsdt === null ? null : dec(n.cotacaoUsdt);
  const taxaUsdt = n.taxaUsdt === undefined ? taxa : n.taxaUsdt === null ? null : dec(n.taxaUsdt);
  return {
    id: n.id ?? `${base}${cotacao}:${sequencia}`,
    simbolo: n.simbolo ?? `${base}${cotacao}`,
    base,
    cotacao,
    lado: n.lado ?? "COMPRA",
    preco,
    quantidade,
    valorCotacao: preco.times(quantidade),
    taxa,
    ativoTaxa: n.ativoTaxa ?? cotacao,
    cotacaoUsdt,
    taxaUsdt,
    origem: n.origem ?? "manual",
    idOrdem: String(sequencia),
    em: n.em ?? sequencia,
  };
}
