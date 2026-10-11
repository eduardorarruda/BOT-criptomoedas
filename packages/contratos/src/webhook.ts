import { createHmac, timingSafeEqual } from "node:crypto";

export * from "./webhook-esquemas.js";

/**
 * Webhooks entre a API e o n8n são assinados (HMAC-SHA256 sobre "carimbo.corpo") e
 * expiram: quem copiar uma requisição não consegue reenviá-la depois de 5 minutos.
 * Cabeçalho: `X-ZenTrade-Assinatura: t=<segundos>,v1=<hex>`. A assinatura é sobre o
 * corpo bruto, byte a byte; corpo vazio assina a string vazia.
 */
export const CABECALHO_ASSINATURA = "x-zentrade-assinatura";
export const TOLERANCIA_SEGUNDOS = 300;

const assinatura = (corpo: string, segredo: string, carimbo: number): string =>
  createHmac("sha256", segredo).update(`${carimbo}.${corpo}`).digest("hex");

export function assinar(corpo: string, segredo: string, agoraMs: number): string {
  if (segredo.length < 32) throw new Error("o segredo do webhook precisa ter pelo menos 32 caracteres");
  const t = Math.floor(agoraMs / 1000);
  return `t=${t},v1=${assinatura(corpo, segredo, t)}`;
}

/** Partes do cabeçalho, sem conferir nada. `null` se o formato não for `t=<inteiro>,v1=<64 hex>`. */
export function lerCabecalhoAssinatura(
  cabecalho: string | undefined,
): { readonly carimbo: number; readonly v1: string } | null {
  if (!cabecalho) return null;
  const partes = Object.fromEntries(cabecalho.split(",").map((p) => p.split("=", 2) as [string, string]));
  const t = Number(partes.t);
  const v1 = partes.v1;
  if (!Number.isInteger(t) || !v1 || !/^[0-9a-f]{64}$/.test(v1)) return null;
  return { carimbo: t, v1 };
}

export function verificar(
  corpo: string,
  cabecalho: string | undefined,
  segredo: string,
  agoraMs: number,
): boolean {
  const lido = lerCabecalhoAssinatura(cabecalho);
  if (!lido) return false;
  if (Math.abs(Math.floor(agoraMs / 1000) - lido.carimbo) > TOLERANCIA_SEGUNDOS) return false;
  const esperada = Buffer.from(assinatura(corpo, segredo, lido.carimbo), "hex");
  return timingSafeEqual(esperada, Buffer.from(lido.v1, "hex"));
}

/**
 * Por quantos segundos ainda vale uma assinatura com este carimbo: o tempo que o
 * anti-replay precisa lembrar dela. Nunca menos que 1.
 */
export function segundosDeValidade(carimbo: number, agoraMs: number): number {
  return Math.max(1, carimbo + TOLERANCIA_SEGUNDOS - Math.floor(agoraMs / 1000) + 1);
}
