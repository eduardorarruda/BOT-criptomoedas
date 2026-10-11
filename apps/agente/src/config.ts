import { z } from "zod";
import { MODELO_PADRAO } from "./analista.js";
import { lerContas, type ContaClaude } from "./claude-cli/contas.js";

const inteiro = (min: number, max: number, padrao: number) =>
  z.coerce.number().int().min(min).max(max).default(padrao);

const Ambiente = z.object({
  // Opcional: sem ela, o provedor "api" fica indisponível e só o Claude Code (CLI) atende.
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  AGENTE_SEGREDO: z
    .string("defina o segredo compartilhado com o motor e a API")
    .min(32, "precisa de pelo menos 32 caracteres"),
  DATABASE_URL: z.url("defina a URL do PostgreSQL, ex.: postgres://usuario:senha@localhost:55432/zentrade"),
  // Opcional: sem Redis, os passos ao vivo das análises (eventos "analise") não são publicados.
  REDIS_URL: z
    .url("REDIS_URL precisa ser uma URL, ex.: redis://:senha@127.0.0.1:56379")
    .refine((v) => /^rediss?:\/\//.test(v), "REDIS_URL precisa começar com redis:// ou rediss://")
    .optional(),
  AGENTE_PORTA: inteiro(1, 65_535, 8081),
  // 0.0.0.0 para o motor alcançar pela rede do Docker; não publique esta porta para fora.
  AGENTE_HOST: z.string().min(1).default("0.0.0.0"),
  AGENTE_MODELO: z.string().min(1).default(MODELO_PADRAO),
  AGENTE_TIMEOUT_MS: inteiro(1_000, 600_000, 55_000),
  ZENTRADE_USUARIO_ID: z.uuid("precisa ser um uuid").optional(),
  // Teto de custo de IA: análises simultâneas e por minuto.
  AGENTE_MAX_SIMULTANEAS: inteiro(1, 64, 4),
  AGENTE_MAX_POR_MINUTO: inteiro(1, 600, 30),
  // Claude Code (provedor "cli"): executável, contas (id=/pasta,...) e tetos por execução.
  AGENTE_CLAUDE_CAMINHO: z.string().min(1).default("claude"),
  AGENTE_CLAUDE_CONTAS: z.string().optional(),
  AGENTE_CLI_MAX_TURNOS: inteiro(1, 50, 8),
  AGENTE_CLI_TETO_USD: z.coerce.number().min(0.01).max(50).default(1),
  // Assistente (chat): prazo de uma resposta e teto de respostas.
  AGENTE_CHAT_TIMEOUT_MS: inteiro(10_000, 1_800_000, 300_000),
  AGENTE_CHAT_MAX_SIMULTANEAS: inteiro(1, 64, 4),
  AGENTE_CHAT_MAX_POR_MINUTO: inteiro(1, 600, 20),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
});

export interface ConfigCliDoAgente {
  readonly caminho: string;
  readonly contas: readonly ContaClaude[];
  readonly maxTurnos: number;
  readonly tetoUsd: number;
}

export interface ConfigAgente {
  readonly chaveAnthropic?: string;
  readonly segredo: string;
  readonly urlBanco: string;
  readonly urlRedis?: string;
  readonly porta: number;
  readonly host: string;
  readonly modelo: string;
  readonly timeoutMs: number;
  readonly maxSimultaneas: number;
  readonly maxPorMinuto: number;
  readonly usuarioIdPadrao?: string;
  readonly cli: ConfigCliDoAgente;
  readonly chat: {
    readonly timeoutMs: number;
    readonly maxSimultaneas: number;
    readonly maxPorMinuto: number;
  };
  readonly nivelLog: z.infer<typeof Ambiente>["LOG_LEVEL"];
}

export class ErroConfiguracao extends Error {
  override name = "ErroConfiguracao";
}

/** Variável vazia (`ZENTRADE_USUARIO_ID=` no .env, `${X:-}` no compose) conta como ausente. */
export function semVazias(env: Readonly<Record<string, string | undefined>>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(env).filter((par): par is [string, string] => par[1] !== undefined && par[1] !== ""),
  );
}

function contasDe(valor: string | undefined): readonly ContaClaude[] {
  try {
    return lerContas(valor);
  } catch (e) {
    throw new ErroConfiguracao(`Configuração do agente inválida — ${(e as Error).message}`);
  }
}

/** Lê e valida o ambiente no início; a mensagem diz o nome da variável, nunca o valor. */
export function configDoAgente(env: Readonly<Record<string, string | undefined>>): ConfigAgente {
  const lido = Ambiente.safeParse(semVazias(env));
  if (!lido.success) {
    const problemas = lido.error.issues.map((i) => `${String(i.path[0])}: ${i.message}`).join("; ");
    throw new ErroConfiguracao(`Configuração do agente inválida — ${problemas}. Veja o .env.example.`);
  }
  const a = lido.data;
  return {
    segredo: a.AGENTE_SEGREDO,
    urlBanco: a.DATABASE_URL,
    porta: a.AGENTE_PORTA,
    host: a.AGENTE_HOST,
    modelo: a.AGENTE_MODELO,
    timeoutMs: a.AGENTE_TIMEOUT_MS,
    maxSimultaneas: a.AGENTE_MAX_SIMULTANEAS,
    maxPorMinuto: a.AGENTE_MAX_POR_MINUTO,
    nivelLog: a.LOG_LEVEL,
    cli: {
      caminho: a.AGENTE_CLAUDE_CAMINHO,
      contas: contasDe(a.AGENTE_CLAUDE_CONTAS),
      maxTurnos: a.AGENTE_CLI_MAX_TURNOS,
      tetoUsd: a.AGENTE_CLI_TETO_USD,
    },
    chat: {
      timeoutMs: a.AGENTE_CHAT_TIMEOUT_MS,
      maxSimultaneas: a.AGENTE_CHAT_MAX_SIMULTANEAS,
      maxPorMinuto: a.AGENTE_CHAT_MAX_POR_MINUTO,
    },
    ...(a.ANTHROPIC_API_KEY ? { chaveAnthropic: a.ANTHROPIC_API_KEY } : {}),
    ...(a.REDIS_URL ? { urlRedis: a.REDIS_URL } : {}),
    ...(a.ZENTRADE_USUARIO_ID ? { usuarioIdPadrao: a.ZENTRADE_USUARIO_ID } : {}),
  };
}
