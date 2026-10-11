import { dec } from "@zentrade/dominio";

/** Contas de posição e execução para exibir, todas em Decimal a partir de texto. */
export interface ExecucaoTexto {
  readonly preco: string;
  readonly quantidade: string;
  readonly taxaCotacao: string;
}

export function naoRealizado(quantidade: string, precoMedio: string, precoAtual: string): string {
  return dec(quantidade).times(dec(precoAtual).minus(precoMedio)).toFixed(2);
}

/** Quanto o preço andou desde o preço médio, em fração ("0.0125" = +1,25%). */
export function variacao(precoMedio: string, precoAtual: string): string {
  const medio = dec(precoMedio);
  return medio.isZero() ? "0" : dec(precoAtual).minus(medio).div(medio).toFixed(6);
}

/** Distância do preço de agora até um nível (stop ou alvo), em fração do preço de agora. */
export function distancia(precoAtual: string, nivel: string): string {
  const atual = dec(precoAtual);
  return atual.isZero() ? "0" : dec(nivel).minus(atual).div(atual).toFixed(6);
}

export function precoMedioExecucoes(execucoes: readonly ExecucaoTexto[]): string | null {
  const quantidade = execucoes.reduce((t, e) => t.plus(e.quantidade), dec(0));
  if (quantidade.isZero()) return null;
  const custo = execucoes.reduce((t, e) => t.plus(dec(e.preco).times(e.quantidade)), dec(0));
  return custo.div(quantidade).toFixed();
}

export const taxaTotal = (execucoes: readonly ExecucaoTexto[]): string =>
  execucoes.reduce((t, e) => t.plus(e.taxaCotacao), dec(0)).toFixed();

export const temQuantidade = (texto: string): boolean => dec(texto).gt(0);
