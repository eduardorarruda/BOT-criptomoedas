import type { DecisaoDTO, EstrategiaDTO, PosicaoDTO } from "@zentrade/contratos/esquemas";
import { dec, precoAlvo, precoStop, type Valor } from "@zentrade/dominio";

/**
 * Stop e alvo da posição aberta, para as linhas do gráfico, pelas mesmas contas do
 * motor (apps/motor/src/nucleo/protecao.ts): entre a regra e o agente fica o mais
 * conservador — stop mais alto ainda abaixo do preço, alvo mais baixo que ainda
 * cubra as duas taxas — convertido em fração do preço da compra e aplicado ao preço
 * médio. É uma estimativa da tela: o motor não publica a proteção efetiva.
 */
export interface LinhasProtecao {
  readonly stop: string;
  readonly alvo: string;
}

const textoOuNulo = (t: string | undefined): Valor | null => (t === undefined ? null : dec(t));

function fracoes(estrategia: EstrategiaDTO, compra: DecisaoDTO | undefined) {
  if (!compra?.proposta) return { stop: estrategia.stop, alvoLiquido: estrategia.alvoLiquido };
  const preco = dec(compra.preco);
  const taxa = estrategia.taxa;
  const stopRegra = precoStop(preco, estrategia.stop);
  const alvoRegra = precoAlvo(preco, estrategia.alvoLiquido, taxa);
  const stopAgente = textoOuNulo(compra.proposta.stop);
  const alvoAgente = textoOuNulo(compra.proposta.alvo);
  const empate = precoAlvo(preco, 0, taxa);
  const stop = stopAgente?.gt(stopRegra) && stopAgente.lt(preco) ? stopAgente : stopRegra;
  const alvo = alvoAgente?.lt(alvoRegra) && alvoAgente.gt(empate) ? alvoAgente : alvoRegra;
  return {
    stop: dec(1).minus(stop.div(preco)).toNumber(),
    alvoLiquido: alvo
      .times(dec(1).minus(taxa))
      .div(preco.times(dec(1).plus(taxa)))
      .minus(1)
      .toNumber(),
  };
}

/** `null` sem posição aberta ou sem a estratégia do robô. */
export function linhasProtecao(
  posicao: PosicaoDTO | undefined,
  estrategia: EstrategiaDTO | undefined,
  compra: DecisaoDTO | undefined,
): LinhasProtecao | null {
  if (!posicao || !estrategia || !dec(posicao.quantidade).gt(0)) return null;
  const medio = dec(posicao.precoMedio);
  const f = fracoes(estrategia, compra);
  return {
    stop: precoStop(medio, f.stop).toFixed(8),
    alvo: precoAlvo(medio, f.alvoLiquido, estrategia.taxa).toFixed(8),
  };
}

/** A compra executada mais recente: quem abriu a posição que está aberta. */
export const compraQueAbriu = (decisoes: readonly DecisaoDTO[]): DecisaoDTO | undefined =>
  [...decisoes]
    .filter((d) => d.sinal.acao === "COMPRAR" && d.estado === "executada")
    .sort((a, b) => b.em - a.em)[0];
