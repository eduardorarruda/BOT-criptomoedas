import { ConfigBancoEsquema } from "@zentrade/banco";
import { z } from "zod";

const booleano = z
  .enum(["true", "false"], { error: "use true ou false" })
  .default("true")
  .transform((v) => v === "true");

const url = (nome: string, exemplo: string) =>
  z.url({ error: `${nome} precisa ser uma URL (ex.: ${exemplo})` });

/** Variáveis de ambiente da API, validadas no início: configuração errada derruba cedo, com explicação. */
const EsquemaApi = z.object({
  API_HOST: z.string().default("127.0.0.1"),
  API_PORTA: z.coerce.number().int().min(1).max(65_535).default(8080),
  REDIS_URL: url("REDIS_URL", "redis://:senha@127.0.0.1:56379").refine((v) => /^rediss?:\/\//.test(v), {
    error: "REDIS_URL precisa começar com redis:// ou rediss://",
  }),
  ZENTRADE_ORIGEM_WEB: url("ZENTRADE_ORIGEM_WEB", "http://localhost:5173").default("http://localhost:5173"),
  COOKIE_SEGURO: booleano,
  N8N_URL: url("N8N_URL", "http://127.0.0.1:5678").default("http://127.0.0.1:5678"),
  N8N_WEBHOOK_SEGREDO: z
    .string({ error: "defina N8N_WEBHOOK_SEGREDO (gere com: openssl rand -hex 32)" })
    .min(32, "N8N_WEBHOOK_SEGREDO precisa ter pelo menos 32 caracteres (gere com: openssl rand -hex 32)"),
  N8N_USUARIO_ID: z.uuid("N8N_USUARIO_ID precisa ser o UUID de uma pessoa").optional(),
  AGENTE_URL: url("AGENTE_URL", "http://127.0.0.1:8081").optional(),
  EMBEDDINGS_URL: url("EMBEDDINGS_URL", "http://127.0.0.1:11434/v1/embeddings").optional(),
  EMBEDDINGS_MODELO: z.string().min(1).default("bge-m3"),
  EMBEDDINGS_CHAVE: z.string().min(1).optional(),
  APROVACAO_VALIDADE_MIN: z.coerce.number().int().min(1).max(1440).default(15),
  LOG_NIVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
});

const Esquema = ConfigBancoEsquema.extend(EsquemaApi.shape).transform((c) => ({
  ...c,
  embeddings: c.EMBEDDINGS_URL
    ? {
        url: c.EMBEDDINGS_URL,
        modelo: c.EMBEDDINGS_MODELO,
        ...(c.EMBEDDINGS_CHAVE ? { chave: c.EMBEDDINGS_CHAVE } : {}),
      }
    : null,
}));

export type Config = z.infer<typeof Esquema>;

export function lerConfig(env: NodeJS.ProcessEnv): Config {
  const lido = Esquema.safeParse(env);
  if (!lido.success) {
    const problemas = lido.error.issues.map((i) => `- ${i.path.join(".")}: ${i.message}`);
    throw new Error(`configuração da API inválida (veja .env.example):\n${problemas.join("\n")}`);
  }
  return lido.data;
}
