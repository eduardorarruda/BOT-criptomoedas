import type { FastifyBaseLogger } from "fastify";
import { pino, type DestinationStream } from "pino";

/**
 * Logs em JSON (pino) sem segredo: cabeçalhos de credencial e campos sensíveis do
 * corpo são trocados por "[oculto]", e erros saem sem pilha (só tipo, mensagem e código).
 */
const OCULTAR = [
  "req.headers.authorization",
  "req.headers.cookie",
  'req.headers["x-csrf-token"]',
  'req.headers["x-zentrade-assinatura"]',
  'res.headers["set-cookie"]',
  "*.senha",
  "*.apiKey",
  "*.apiSecret",
  "*.codigo2fa",
  "*.codigo",
  "*.token",
  "*.segredo",
];

export function resumirErro(erro: unknown): Record<string, unknown> {
  if (!(erro instanceof Error)) return { mensagem: String(erro) };
  const codigo = (erro as { code?: unknown }).code;
  return { tipo: erro.name, mensagem: erro.message, ...(typeof codigo === "string" ? { codigo } : {}) };
}

export function criarLog(nivel: string, destino?: DestinationStream): FastifyBaseLogger {
  const opcoes = {
    level: nivel,
    redact: { paths: OCULTAR, censor: "[oculto]" },
    serializers: { err: resumirErro },
  };
  return destino ? pino(opcoes, destino) : pino(opcoes);
}
