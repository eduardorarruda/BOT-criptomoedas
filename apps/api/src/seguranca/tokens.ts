import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** 32 bytes aleatórios em base64url, com prefixo para quem achar o token num log saber o que é. */
export const gerarToken = (prefixo: string): string => `${prefixo}${randomBytes(32).toString("base64url")}`;

export const sha256 = (texto: string): string => createHash("sha256").update(texto, "utf8").digest("hex");

/** Comparação de tempo constante: não vaza, pelo tempo de resposta, quantos caracteres bateram. */
export function iguais(a: string, b: string): boolean {
  const x = Buffer.from(sha256(a), "hex");
  const y = Buffer.from(sha256(b), "hex");
  return timingSafeEqual(x, y) && a.length === b.length;
}
