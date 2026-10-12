import type { IdsProtecao } from "@zentrade/contratos";
import { createHash } from "node:crypto";

/**
 * newClientOrderId determinístico a partir do id da decisão: a mesma decisão sempre
 * gera o mesmo id, e a Binance recusa o segundo envio com o mesmo id. "zt-" + 32
 * caracteres base64url = 35, dentro do limite de 36 e do alfabeto [a-zA-Z0-9-_].
 */
export const idClienteDe = (decisaoId: string): string =>
  `zt-${createHash("sha256").update(decisaoId).digest("base64url").slice(0, 32)}`;

/**
 * Ids de uma proteção na corretora a partir de uma chave única por colocação: a
 * lista (OCO) e cada perna. No stop sozinho, a lista é o próprio stop.
 */
export function idsProtecaoDe(chave: string, comAlvo: boolean): IdsProtecao {
  const stop = idClienteDe(`${chave}:stop`);
  if (!comAlvo) return { lista: stop, stop };
  return { lista: idClienteDe(`${chave}:lista`), stop, alvo: idClienteDe(`${chave}:alvo`) };
}
