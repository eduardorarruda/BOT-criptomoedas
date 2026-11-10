import { ConfigBancoEsquema } from "@zentrade/banco";
import { FusoInstanciaEsquema, TextoDecimal } from "@zentrade/contratos";
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
    /** Placar do Claude: avalia as decisões que passaram pelo agente (só com banco, no processo dos robôs). */
    MOTOR_PLACAR: Booleano.default(true),
    /** De quantos em quantos minutos o avaliador roda. */
    MOTOR_PLACAR_MINUTOS: z.coerce.number().int().min(1).max(1440).default(5),
    /** Candles esperados por stop, alvo, regra ou tempo antes de fechar a conta no horizonte. */
    MOTOR_PLACAR_HORIZONTE: z.coerce.number().int().min(1).max(1000).default(500),
    /** Deslizamento mais meio spread do contrafactual no cripto (pontos-base; 7 = o padrão do backtest). */
    MOTOR_PLACAR_BPS: z.coerce.number().min(0).max(100).default(7),
    /** Só decisões dos últimos N dias. */
    MOTOR_PLACAR_DIAS: z.coerce.number().int().min(1).max(365).default(30),
    /** Decisões por rodada. */
    MOTOR_PLACAR_LOTE: z.coerce.number().int().min(1).max(500).default(50),
    /** Coletor do MetaTrader 5 (perfil mt5 do compose); sem ele, o botão explica o que falta. */
    COLETOR_MT5_URL: z.url().optional(),
    /** Atualização diária do WIN pelo MT5, depois do fechamento (desligue com false). */
    MOTOR_MT5_AUTO: Booleano.default(true),
    /** Hora de Brasília a partir da qual roda (o pregão fecha às 18:25). */
    MOTOR_MT5_HORA: z.coerce.number().int().min(18).max(23).default(19),
    /** Quanto histórico pedir na primeira vez (a corretora entrega o que tiver). */
    MOTOR_MT5_HISTORICO_DIAS: z.coerce.number().int().min(1).max(1095).default(730),
    /**
     * "cripto" (Binance) ou "b3": o motor do papel do mini índice (R1), com velas do MT5
     * (só leitura) e só os robôs WINBRL. Os dois mercados rodam em processos separados.
     */
    MOTOR_MERCADO: z.enum(["cripto", "b3"]).default("cripto"),
    /** O arquivo ao vivo do EA ZenTradeWINVivo (últimas velas de 5 min, reescrito a cada 5 s). */
    MOTOR_B3_VIVO: z.string().default(""),
    /** Exports completos do MT5 (história dos indicadores), lidos uma vez; separados por vírgula. */
    MOTOR_B3_HISTORICO: z.string().default(""),
    /** Fuso dos horários dos CSVs do MT5 (o da Rico é o de Brasília). */
    MOTOR_B3_FUSO: z.string().min(1).default("America/Sao_Paulo"),
    /** Conta de papel da B3 (reais), dividida entre os robôs do WIN. */
    MOTOR_B3_SALDO: TextoDecimal.default("120000"),
    MOTOR_B3_MARGEM: TextoDecimal.default("155"),
    MOTOR_B3_TARIFA: TextoDecimal.default("0.25"),
    MOTOR_B3_DESLIZAMENTO_TICKS: z.coerce.number().int().min(0).max(20).default(1),
    MOTOR_B3_CONTRATOS_MAXIMOS: z.coerce.number().int().min(1).max(100).default(5),
    /** Pontos: traduz tarifa e ticks nas frações da corretora de papel (erro de centavos a ±20%). */
    MOTOR_B3_PRECO_REFERENCIA: z.coerce.number().int().min(10_000).max(1_000_000).default(180_000),
    /** R2: o candle fechou há mais que isto (segundos) = não abre posição. */
    MOTOR_B3_IDADE_SINAL_S: z.coerce.number().int().min(10).max(3600).default(120),
    /** R2: a última vela do MT5 tem mais que isto (minutos) = ordem recusada. */
    MOTOR_B3_IDADE_COTACAO_MIN: z.coerce.number().int().min(1).max(120).default(7),
    /** De quantos em quantos segundos lê os CSVs do MT5 (o EA escreve a cada 5 s). */
    MOTOR_B3_CONSULTA_S: z.coerce.number().int().min(1).max(300).default(10),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
    /** O fuso da instância: onde começa o dia da perda diária (padrão: America/Sao_Paulo). */
    ZENTRADE_FUSO: FusoInstanciaEsquema,
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
    if (c.MOTOR_MERCADO === "b3" && c.MOTOR_REDE !== "papel")
      ctx.addIssue({
        code: "custom",
        path: ["MOTOR_REDE"],
        message: "a B3 só roda no papel (nenhuma ordem sai para a bolsa): use MOTOR_REDE=papel",
      });
    if (c.MOTOR_MERCADO === "b3" && c.MOTOR_B3_VIVO.trim() === "")
      ctx.addIssue({
        code: "custom",
        path: ["MOTOR_B3_VIVO"],
        message: "diga onde está o CSV ao vivo do EA ZenTradeWINVivo (pasta MQL5/Files do MT5)",
      });
    if (c.MOTOR_MERCADO === "b3" && c.MOTOR_FUNCAO !== "robos")
      ctx.addIssue({
        code: "custom",
        path: ["MOTOR_FUNCAO"],
        message:
          "o motor da B3 só roda robôs (os backtests ficam no processo do cripto): use MOTOR_FUNCAO=robos",
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
