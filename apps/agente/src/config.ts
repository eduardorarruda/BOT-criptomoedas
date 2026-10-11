import { z } from "zod";
import { MODELO_PADRAO } from "./analista.js";

const Ambiente = z.object({
  ANTHROPIC_API_KEY: z.string("defina a chave da API da Anthropic").min(1),
  AGENTE_SEGREDO: z
    .string("defina o segredo compartilhado com o motor")
    .min(32, "precisa de pelo menos 32 caracteres"),
  DATABASE_URL: z.url("defina a URL do PostgreSQL, ex.: postgres://usuario:senha@localhost:55432/zentrade"),
  AGENTE_PORTA: z.coerce.number().int().min(1).max(65_535).default(8081),
  // 0.0.0.0 para o motor alcançar pela rede do Docker; não publique esta porta para fora.
  AGENTE_HOST: z.string().min(1).default("0.0.0.0"),
  AGENTE_MODELO: z.string().min(1).default(MODELO_PADRAO),
  AGENTE_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(600_000).default(55_000),
  ZENTRADE_USUARIO_ID: z.uuid("precisa ser um uuid").optional(),
  // Teto de custo de IA: análises simultâneas e por minuto.
  AGENTE_MAX_SIMULTANEAS: z.coerce.number().int().min(1).max(64).default(4),
  AGENTE_MAX_POR_MINUTO: z.coerce.number().int().min(1).max(600).default(30),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
});

export interface ConfigAgente {
  readonly chaveAnthropic: string;
  readonly segredo: string;
  readonly urlBanco: string;
  readonly porta: number;
  readonly host: string;
  readonly modelo: string;
  readonly timeoutMs: number;
  readonly maxSimultaneas: number;
  readonly maxPorMinuto: number;
  readonly usuarioIdPadrao?: string;
  readonly nivelLog: z.infer<typeof Ambiente>["LOG_LEVEL"];
}

export class ErroConfiguracao extends Error {
  override name = "ErroConfiguracao";
}

/** Lê e valida o ambiente no início; a mensagem diz o nome da variável, nunca o valor. */
export function configDoAgente(env: Readonly<Record<string, string | undefined>>): ConfigAgente {
  const lido = Ambiente.safeParse(env);
  if (!lido.success) {
    const problemas = lido.error.issues.map((i) => `${String(i.path[0])}: ${i.message}`).join("; ");
    throw new ErroConfiguracao(`Configuração do agente inválida — ${problemas}. Veja o .env.example.`);
  }
  const a = lido.data;
  return {
    chaveAnthropic: a.ANTHROPIC_API_KEY,
    segredo: a.AGENTE_SEGREDO,
    urlBanco: a.DATABASE_URL,
    porta: a.AGENTE_PORTA,
    host: a.AGENTE_HOST,
    modelo: a.AGENTE_MODELO,
    timeoutMs: a.AGENTE_TIMEOUT_MS,
    maxSimultaneas: a.AGENTE_MAX_SIMULTANEAS,
    maxPorMinuto: a.AGENTE_MAX_POR_MINUTO,
    nivelLog: a.LOG_LEVEL,
    ...(a.ZENTRADE_USUARIO_ID ? { usuarioIdPadrao: a.ZENTRADE_USUARIO_ID } : {}),
  };
}
