import { createHash } from "node:crypto";

/**
 * newClientOrderId determinístico a partir do id da decisão: a mesma decisão sempre
 * gera o mesmo id, e a Binance recusa o segundo envio com o mesmo id. "zt-" + 32
 * caracteres base64url = 35, dentro do limite de 36 e do alfabeto [a-zA-Z0-9-_].
 */
export const idClienteDe = (decisaoId: string): string =>
  `zt-${createHash("sha256").update(decisaoId).digest("base64url").slice(0, 32)}`;
