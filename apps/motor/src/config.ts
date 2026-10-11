import { TextoDecimal } from "@zentrade/contratos";
import { z } from "zod";

const Booleano = z.enum(["true", "false", "1", "0"]).transform((v) => v === "true" || v === "1");

/**
 * Tudo o que o motor lê do ambiente, validado na partida. Segredo só por variável de
 * ambiente (o bot antigo tinha chave no git). Dinheiro real não liga por aqui.
 */
export const EsquemaConfig = z
  .object({
    MOTOR_REDE: z.enum(["papel", "testnet"]).default("papel"),
    MOTOR_PAPEL_DADOS: z.enum(["testnet", "real"]).default("testnet"),
    MOTOR_ROBOS_ARQUIVO: z.string().min(1).default("robos.exemplo.json"),
    MOTOR_AGENTE_OBRIGATORIO: Booleano.default(true),
    MOTOR_AGENTE_FIXO: z.enum(["sempre_concorda", "nunca_concorda"]).default("nunca_concorda"),
    MOTOR_HISTORICO: z.coerce.number().int().min(50).max(1000).default(500),
    MOTOR_PAPEL_SALDO: TextoDecimal.default("1000"),
    MOTOR_PAPEL_TAXA: z.coerce.number().min(0).lt(0.01).default(0.001),
    MOTOR_PAPEL_DESLIZAMENTO_BPS: z.coerce.number().min(0).max(1000).default(5),
    AGENTE_URL: z.url().optional(),
    AGENTE_SEGREDO: z.string().min(32, "precisa ter pelo menos 32 caracteres").optional(),
    BINANCE_API_KEY: z.string().optional(),
    BINANCE_API_SECRET: z.string().optional(),
    BINANCE_TAXA_ESTIMADA: z.coerce.number().min(0).lt(0.01).default(0.001),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  })
  .superRefine((c, ctx) => {
    if (c.MOTOR_REDE === "testnet" && (!c.BINANCE_API_KEY || !c.BINANCE_API_SECRET))
      ctx.addIssue({
        code: "custom",
        path: ["BINANCE_API_KEY"],
        message:
          "a testnet exige BINANCE_API_KEY e BINANCE_API_SECRET (crie em https://testnet.binance.vision)",
      });
    if (c.AGENTE_URL && !c.AGENTE_SEGREDO)
      ctx.addIssue({
        code: "custom",
        path: ["AGENTE_SEGREDO"],
        message: "obrigatório quando AGENTE_URL está definida",
      });
  });

export type Config = z.infer<typeof EsquemaConfig>;

export class ErroConfig extends Error {
  override name = "ErroConfig";
}

/** Lê e valida o ambiente; variável vazia conta como ausente. Erro lista cada variável com problema. */
export function lerConfig(env: Readonly<Record<string, string | undefined>>): Config {
  const preenchidas = Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined && v !== ""));
  const r = EsquemaConfig.safeParse(preenchidas);
  if (r.success) return r.data;
  const linhas = r.error.issues.map((i) => `- ${i.path.join(".")}: ${i.message}`);
  throw new ErroConfig(
    `Configuração do motor inválida. Corrija no .env (veja .env.example):\n${linhas.join("\n")}`,
  );
}
