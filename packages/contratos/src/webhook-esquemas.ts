import { z } from "zod";
import { Id, Instante } from "./comum.js";

/**
 * Corpos dos webhooks entre a API e o n8n. Ficam separados de `webhook.ts` (que
 * assina com node:crypto) para a tela poder importar os formatos sem levar código
 * de servidor para o navegador.
 */

/** API → n8n (`POST $N8N_URL/webhook/zentrade-proposta`): pede aprovação humana. */
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

/** n8n → API (`POST /webhooks/n8n/aprovacao`): a resposta da pessoa. */
export const RespostaAprovacaoEsquema = z.object({
  decisaoId: Id,
  aprovada: z.boolean(),
  porQuem: z.string().max(80),
});
export type RespostaAprovacao = z.infer<typeof RespostaAprovacaoEsquema>;

/** API → n8n (`POST $N8N_URL/webhook/zentrade-alerta`). */
export const AlertaEsquema = z.object({
  tipo: z.string().min(1).max(40),
  titulo: z.string().min(1).max(120),
  mensagem: z.string().min(1).max(1000),
  em: Instante,
  /** info, atencao ou critico: o n8n põe um sinal na frente do título. */
  gravidade: z.enum(["info", "atencao", "critico"]).optional(),
  /** O mesmo fato repetido dentro de 10 min não vira segunda mensagem no n8n. */
  chave: z.string().min(1).max(200).optional(),
});
export type Alerta = z.infer<typeof AlertaEsquema>;

export const FonteDocumento = z.enum(["diario", "noticia", "regra_corretora", "estrategia", "nota"]);
export type FonteDocumento = z.infer<typeof FonteDocumento>;

/** Tamanho máximo do texto de um documento do RAG, em caracteres. */
export const LIMITE_TEXTO_CONHECIMENTO = 100_000;

/** n8n → API (`POST /webhooks/n8n/conhecimento`): notícia ou regra para o RAG. */
export const ConhecimentoWebhookEsquema = z.object({
  fonte: FonteDocumento,
  titulo: z.string().min(1).max(200),
  // Só http(s): a tela mostra o link, e "javascript:" viraria XSS.
  url: z
    .url({ protocol: /^https?$/, error: "a url precisa começar com http:// ou https://" })
    .max(2000)
    .optional(),
  publicadoEm: Instante,
  texto: z.string().min(1).max(LIMITE_TEXTO_CONHECIMENTO),
});
export type ConhecimentoWebhook = z.infer<typeof ConhecimentoWebhookEsquema>;

/** Resposta de `POST /webhooks/n8n/saude`, lida pelo fluxo zentrade-vigia-saude. */
export const SaudeN8nEsquema = z.object({
  /** Segundos desde a última batida do motor; `null` se ele nunca bateu. */
  motorVivoHaSegundos: z.number().int().nonnegative().nullable(),
  robosPausados: z.number().int().nonnegative(),
});
export type SaudeN8n = z.infer<typeof SaudeN8nEsquema>;
