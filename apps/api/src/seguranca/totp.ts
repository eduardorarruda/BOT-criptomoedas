import { generateSecret, generateURI, verify } from "otplib";

/** Aceita o código do passo anterior e do seguinte (±30 s): relógio do celular raramente bate exato. */
const TOLERANCIA_SEGUNDOS = 30;

export const gerarSegredoTotp = (): string => generateSecret();

export const uriTotp = (segredo: string, email: string): string =>
  generateURI({ issuer: "ZenTrade", label: email, secret: segredo });

export async function verificarCodigoTotp(segredo: string, codigo: string): Promise<boolean> {
  if (!/^\d{6}$/.test(codigo)) return false;
  const resultado = await verify({ secret: segredo, token: codigo, epochTolerance: TOLERANCIA_SEGUNDOS });
  return resultado.valid;
}
