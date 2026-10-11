import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { Id, Instante } from "./comum.js";

/**
 * Webhooks entre a API e o n8n são assinados (HMAC-SHA256 sobre "carimbo.corpo") e
 * expiram: quem copiar uma requisição não consegue reenviá-la depois de 5 minutos.
 * Cabeçalho: `X-ZenTrade-Assinatura: t=<segundos>,v1=<hex>`.
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

export function verificar(
  corpo: string,
  cabecalho: string | undefined,
  segredo: string,
  agoraMs: number,
): boolean {
  if (!cabecalho) return false;
  const partes = Object.fromEntries(cabecalho.split(",").map((p) => p.split("=", 2) as [string, string]));
  const t = Number(partes.t);
  const recebida = partes.v1;
  if (!Number.isInteger(t) || !recebida || !/^[0-9a-f]{64}$/.test(recebida)) return false;
  if (Math.abs(Math.floor(agoraMs / 1000) - t) > TOLERANCIA_SEGUNDOS) return false;
  const esperada = Buffer.from(assinatura(corpo, segredo, t), "hex");
  return timingSafeEqual(esperada, Buffer.from(recebida, "hex"));
}

export const PropostaCriadaEsquema = z.object({
  decisaoId: Id,
  roboId: Id,
  simbolo: z.string(),
  acao: z.enum(["COMPRAR", "VENDER"]),
  quantidade: z.string(),
  preco: z.string(),
  resumo: z.string().max(1000),
  expiraEm: Instante,
});
export type PropostaCriada = z.infer<typeof PropostaCriadaEsquema>;

export const RespostaAprovacaoEsquema = z.object({
  decisaoId: Id,
  aprovada: z.boolean(),
  porQuem: z.string().max(80),
});
export type RespostaAprovacao = z.infer<typeof RespostaAprovacaoEsquema>;
