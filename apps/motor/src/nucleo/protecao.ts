import type { PropostaAgente } from "@zentrade/contratos";
import {
  arredondarParaBaixo,
  dec,
  maiorQuantidade,
  precoAlvo,
  type EntradaDimensionamento,
  type FiltrosAtivo,
  type Valor,
} from "@zentrade/dominio";

export interface Protecao {
  readonly stop: Valor;
  readonly alvo: Valor;
}

/** Stop e alvo da posição, em frações do preço de entrada (o formato da estratégia). */
export interface AjustePosicao {
  readonly stop: number;
  readonly alvoLiquido: number;
}

const decimalOuNulo = (texto: string | undefined): Valor | null => (texto === undefined ? null : dec(texto));

/**
 * Entre o stop/alvo da regra e o do agente, fica o mais conservador. Stop: o mais
 * alto que ainda fique abaixo do preço. Alvo: o menor, mas só se cobrir as duas
 * taxas — alvo abaixo do empate é ignorado (o bot antigo vendia pagando a taxa).
 */
export function protecaoConservadora(
  sinal: Protecao,
  proposta: Pick<PropostaAgente, "stop" | "alvo"> | undefined,
  preco: Valor,
  taxa: number,
): Protecao {
  const stopAgente = decimalOuNulo(proposta?.stop);
  const alvoAgente = decimalOuNulo(proposta?.alvo);
  const empate = precoAlvo(preco, 0, taxa);
  const stop = stopAgente && stopAgente.gt(sinal.stop) && stopAgente.lt(preco) ? stopAgente : sinal.stop;
  const alvo = alvoAgente && alvoAgente.lt(sinal.alvo) && alvoAgente.gt(empate) ? alvoAgente : sinal.alvo;
  return { stop, alvo };
}

/**
 * Converte stop/alvo em preço para frações, para a posição aberta seguir pelas mesmas
 * funções do domínio (decidir) — o inverso de precoStop e precoAlvo.
 */
export function ajusteDaPosicao(p: Protecao, preco: Valor, taxa: number): AjustePosicao {
  const stop = dec(1).minus(p.stop.div(preco));
  const alvoLiquido = p.alvo
    .times(dec(1).minus(taxa))
    .div(preco.times(dec(1).plus(taxa)))
    .minus(1);
  return { stop: stop.toNumber(), alvoLiquido: alvoLiquido.toNumber() };
}

/** Maior quantidade pelo risco × tamanho relativo do agente, arredondada no passo. Zero se nada cabe. */
export function quantidadeCompra(e: EntradaDimensionamento, tamanhoRelativo: number): Valor {
  const maxima = maiorQuantidade(e);
  if (!maxima) return dec(0);
  return arredondarParaBaixo(maxima.times(tamanhoRelativo), e.filtros.passoQuantidade);
}

export const quantidadeVenda = (posicao: Valor, filtros: FiltrosAtivo): Valor =>
  arredondarParaBaixo(posicao, filtros.passoQuantidade);
