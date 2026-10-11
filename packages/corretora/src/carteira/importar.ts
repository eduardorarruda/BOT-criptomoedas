import type { OrigemNegociacao } from "@zentrade/contratos";
import { dec, type Valor } from "@zentrade/dominio";
import type { NegociacaoBruta } from "../conta-binance.js";
import type { AtivosDoPar } from "../conversao.js";
import { ativosParaConverter, taxaEmUsdt } from "./movimentos.js";
import { USDT, type Negociacao } from "./tipos.js";

/** O que a importação precisa da conta (ContaBinance cumpre). */
export interface FonteImportacao {
  precoHistoricoUsdt(ativo: string, em: number): Promise<Valor | null>;
  idsCliente(simbolo: string, desdeOrdem: number, ateOrdem: number): Promise<Map<number, string>>;
}

/** A negociação pronta para gravar: com o id da Binance e o clientOrderId da ordem. */
export interface NegociacaoImportada extends Negociacao {
  readonly idNegociacao: number;
  readonly idCliente: string | null;
}

/** O robô do ZenTrade manda toda ordem com newClientOrderId "zt-..." (apps/motor/src/id-cliente.ts). */
export const PREFIXO_ROBO = "zt-";
export const origemDe = (idCliente: string | null): OrigemNegociacao =>
  idCliente?.startsWith(PREFIXO_ROBO) ? "robo" : "manual";

async function converter(
  f: FonteImportacao,
  par: AtivosDoPar,
  b: NegociacaoBruta,
  idCliente: string | null,
): Promise<NegociacaoImportada> {
  const [cotacaoUsdt, precoTaxa] = await Promise.all([
    par.cotacao === USDT ? dec(1) : f.precoHistoricoUsdt(par.cotacao, b.em),
    ativosParaConverter({ ...par, ativoTaxa: b.ativoTaxa }).includes(b.ativoTaxa)
      ? f.precoHistoricoUsdt(b.ativoTaxa, b.em)
      : null,
  ]);
  return {
    id: `${b.simbolo}:${b.id}`,
    idNegociacao: b.id,
    simbolo: b.simbolo,
    base: par.base,
    cotacao: par.cotacao,
    lado: b.isBuyer ? "COMPRA" : "VENDA",
    preco: b.preco,
    quantidade: b.quantidade,
    valorCotacao: b.valorCotacao,
    taxa: b.taxa,
    ativoTaxa: b.ativoTaxa,
    cotacaoUsdt,
    taxaUsdt: taxaEmUsdt(
      { ...par, preco: b.preco, taxa: b.taxa, ativoTaxa: b.ativoTaxa },
      cotacaoUsdt,
      precoTaxa,
    ),
    origem: origemDe(idCliente),
    idOrdem: String(b.orderId),
    idCliente,
    em: b.em,
  };
}

/**
 * Converte as negociações brutas de um par: origem (robô ou manual) pelo clientOrderId
 * da ordem, cotação e taxa em USDT pelo preço do instante. Em sequência: as buscas de
 * preço histórico ficam em cache na conta e não estouram o peso da Binance.
 */
export async function importarNegociacoes(
  f: FonteImportacao,
  par: AtivosDoPar,
  brutas: readonly NegociacaoBruta[],
): Promise<NegociacaoImportada[]> {
  const primeira = brutas[0];
  if (!primeira) return [];
  // reduce, não Math.min(...): milhares de negociações estourariam a pilha de argumentos.
  const menor = brutas.reduce((m, b) => Math.min(m, b.orderId), primeira.orderId);
  const maior = brutas.reduce((m, b) => Math.max(m, b.orderId), primeira.orderId);
  const ids = await f.idsCliente(primeira.simbolo, menor, maior);
  const importadas: NegociacaoImportada[] = [];
  for (const b of brutas) importadas.push(await converter(f, par, b, ids.get(b.orderId) ?? null));
  return importadas;
}
