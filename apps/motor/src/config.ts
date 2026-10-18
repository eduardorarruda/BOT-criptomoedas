import { ConfigBancoEsquema } from "@zentrade/banco";
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
    /** "robos", "backtests" ou "tudo" (os dois no mesmo processo). Ver funcao.ts. */
    MOTOR_FUNCAO: z.enum(["tudo", "robos", "backtests"]).default("tudo"),
    MOTOR_PAPEL_DADOS: z.enum(["testnet", "real"]).default("testnet"),
    MOTOR_ROBOS_ARQUIVO: z.string().min(1).default("robos.exemplo.json"),
    MOTOR_AGENTE_OBRIGATORIO: Booleano.default(true),
    MOTOR_AGENTE_FIXO: z.enum(["sempre_concorda", "nunca_concorda"]).default("nunca_concorda"),
    // 1000 = uma página da Binance; em velas de 5 min, ~83 h: o agente lê o tempo gráfico de 4 h.
    MOTOR_HISTORICO: z.coerce.number().int().min(50).max(1000).default(1000),
    MOTOR_PAPEL_SALDO: TextoDecimal.default("1000"),
    MOTOR_PAPEL_TAXA: z.coerce.number().min(0).lt(0.01).default(0.001),
    MOTOR_PAPEL_DESLIZAMENTO_BPS: z.coerce.number().min(0).max(1000).default(5),
    /** Stop e alvo da posição no livro da corretora (stop-limit/OCO), vivos mesmo com o motor fora do ar. */
    MOTOR_STOP_NA_CORRETORA: Booleano.default(true),
    /** Limite da venda do stop na corretora, em pontos-base abaixo do gatilho (100 = 1%). */
    MOTOR_STOP_LIMITE_BPS: z.coerce.number().int().min(1).max(1000).default(100),
    AGENTE_URL: z.url().optional(),
    AGENTE_SEGREDO: z.string().min(32, "precisa ter pelo menos 32 caracteres").optional(),
    /** Só em desenvolvimento: chave de quem não cadastrou a própria na tela. */
    BINANCE_API_KEY: z.string().optional(),
    BINANCE_API_SECRET: z.string().optional(),
    /** A mesma chave mestra da API: decifra a chave da Binance de cada pessoa (contas_corretora). */
    ZENTRADE_CHAVE_MESTRA: ConfigBancoEsquema.shape.ZENTRADE_CHAVE_MESTRA.optional(),
    ZENTRADE_AMBIENTE: z.enum(["desenvolvimento", "producao"]).default("producao"),
    BINANCE_TAXA_ESTIMADA: z.coerce.number().min(0).lt(0.01).default(0.001),
    /** Com banco: robôs de todas as pessoas, decisões e ordens duráveis. Sem banco: papel em memória. */
    DATABASE_URL: z
      .string()
      .regex(/^postgres(ql)?:\/\//, "precisa começar com postgres://")
      .optional(),
    /** Com Redis: eventos no canal zentrade:eventos, batida do motor e fila de backtests. */
    REDIS_URL: z
      .string()
      .regex(/^rediss?:\/\//, "precisa começar com redis://")
      .optional(),
    /** O mesmo prazo que a API usa para aceitar a aprovação (minutos). */
    APROVACAO_VALIDADE_MIN: z.coerce.number().int().min(1).max(60).default(5),
    MOTOR_RECARGA_SEGUNDOS: z.coerce.number().int().min(5).max(3600).default(30),
    /** WebSocket de candles fora por mais que isto (minutos) vira alerta. */
    MOTOR_ALERTA_WEBSOCKET_MIN: z.coerce.number().int().min(1).max(120).default(5),
    MOTOR_BACKTEST_SALDO: TextoDecimal.default("1000"),
    /**
     * Fração do saldo arriscada por operação no backtest "sem limites" (0,01 = 1%). Por
     * padrão o backtest usa os limites de um robô novo (ou os do robô escolhido).
     */
    MOTOR_BACKTEST_RISCO: z.coerce.number().gt(0).max(0.1).default(0.01),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  })
  .superRefine((c, ctx) => {
    if (c.MOTOR_REDE === "testnet") conferirChavesDaTestnet(c, ctx);
    if (c.MOTOR_REDE === "testnet" && !c.DATABASE_URL)
      ctx.addIssue({
        code: "custom",
        path: ["DATABASE_URL"],
        message:
          "a testnet exige banco (estado durável: decisões, ordens e posição precisam sobreviver a um reinício). Defina DATABASE_URL ou use MOTOR_REDE=papel",
      });
    if (c.AGENTE_URL && !c.AGENTE_SEGREDO)
      ctx.addIssue({
        code: "custom",
        path: ["AGENTE_SEGREDO"],
        message: "obrigatório quando AGENTE_URL está definida",
      });
  });

export type Config = z.infer<typeof EsquemaConfig>;

interface ChavesDoAmbiente {
  readonly BINANCE_API_KEY?: string | undefined;
  readonly BINANCE_API_SECRET?: string | undefined;
  readonly ZENTRADE_CHAVE_MESTRA?: Buffer | undefined;
  readonly ZENTRADE_AMBIENTE: "desenvolvimento" | "producao";
}

/**
 * Fora do papel, cada robô opera com a chave da pessoa dona dele (cadastrada na tela,
 * cifrada no banco): o motor precisa da chave mestra. As chaves do ambiente são só um
 * atalho de desenvolvimento, para quem ainda não cadastrou a própria.
 */
function conferirChavesDaTestnet(c: ChavesDoAmbiente, ctx: z.RefinementCtx): void {
  const desenvolvimento = c.ZENTRADE_AMBIENTE === "desenvolvimento";
  const doAmbiente = Boolean(c.BINANCE_API_KEY && c.BINANCE_API_SECRET);
  if ((c.BINANCE_API_KEY || c.BINANCE_API_SECRET) && !desenvolvimento)
    ctx.addIssue({
      code: "custom",
      path: ["BINANCE_API_KEY"],
      message:
        "BINANCE_API_KEY/SECRET só valem com ZENTRADE_AMBIENTE=desenvolvimento; fora dele, cada pessoa cadastra a própria chave em Contas e chaves e o motor a decifra com ZENTRADE_CHAVE_MESTRA",
    });
  if (!c.ZENTRADE_CHAVE_MESTRA && !(desenvolvimento && doAmbiente))
    ctx.addIssue({
      code: "custom",
      path: ["ZENTRADE_CHAVE_MESTRA"],
      message:
        "a testnet usa a chave da Binance de cada pessoa, cifrada no banco: defina ZENTRADE_CHAVE_MESTRA (a mesma da API)",
    });
}

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
