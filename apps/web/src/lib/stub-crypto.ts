/**
 * Substituto de node:crypto no navegador. A tela não assina nem verifica webhooks —
 * isso é trabalho da API. Se algum código tentar, o erro diz por quê.
 */
const recusar = (): never => {
  throw new Error("assinatura de webhook não está disponível no navegador; isso é feito pela API");
};

export const createHmac = recusar;
export const timingSafeEqual = recusar;
export default { createHmac, timingSafeEqual };
