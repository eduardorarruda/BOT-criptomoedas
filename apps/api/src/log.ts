import { ocultarTokensClaude } from "@zentrade/contratos";
import type { FastifyBaseLogger } from "fastify";
import { pino, type DestinationStream } from "pino";

/**
 * Logs em JSON (pino) sem segredo: cabeçalhos de credencial e campos sensíveis do
 * corpo são trocados por "[oculto]", e erros saem sem pilha (só tipo, mensagem e código).
 * Por último, qualquer token ou chave da Anthropic (sk-ant-…) que sobrar em qualquer
 * lugar da linha vira "sk-ant-[oculto]" antes de ser escrito.
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
  "req.body.token",
  "req.body.codigo",
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
    hooks: { streamWrite: ocultarTokensClaude },
  };
  return destino ? pino(opcoes, destino) : pino(opcoes);
}
