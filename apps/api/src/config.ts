import { ConfigBancoEsquema } from "@zentrade/banco";
import { PROVEDORES_EMBEDDINGS } from "@zentrade/conhecimento";
import { z } from "zod";

const booleano = z
  .enum(["true", "false"], { error: "use true ou false" })
  .default("true")
  .transform((v) => v === "true");

const url = (nome: string, exemplo: string) =>
  z.url({ error: `${nome} precisa ser uma URL (ex.: ${exemplo})` });

const nomeContato = (nome: string) =>
  z
    .string()
    .trim()
    .min(2, `${nome} precisa de um nome`)
    .max(200, `${nome} passa de 200 caracteres`)
    .optional();
const emailContato = (nome: string) =>
  z
    .email({ error: `${nome} precisa ser um e-mail (ex.: privacidade@exemplo.com)` })
    .max(254)
    .optional();

/** Nome e e-mail de um contato da LGPD andam juntos: um sem o outro é configuração pela metade. */
const PARES_LGPD = [
  ["ZENTRADE_CONTROLADOR_NOME", "ZENTRADE_CONTROLADOR_EMAIL"],
  ["ZENTRADE_ENCARREGADO_NOME", "ZENTRADE_ENCARREGADO_EMAIL"],
] as const;

/** Variáveis de ambiente da API, validadas no início: configuração errada derruba cedo, com explicação. */
const EsquemaApi = z.object({
  API_HOST: z.string().default("127.0.0.1"),
  API_PORTA: z.coerce.number().int().min(1).max(65_535).default(8080),
  /** Em quem confiar como proxy reverso (proxy-addr). Docker: "loopback,uniquelocal". */
  API_PROXY_CONFIAVEL: z.string().default(""),
  REDIS_URL: url("REDIS_URL", "redis://:senha@127.0.0.1:56379").refine((v) => /^rediss?:\/\//.test(v), {
    error: "REDIS_URL precisa começar com redis:// ou rediss://",
  }),
  ZENTRADE_ORIGEM_WEB: url("ZENTRADE_ORIGEM_WEB", "http://localhost:5173").default("http://localhost:5173"),
  COOKIE_SEGURO: booleano,
  /**
   * Conectar o Claude da pessoa exige 2FA ligado (padrão). Quem opera a instância pode
   * desligar; a senha confirmada nos últimos 5 minutos continua sendo pedida.
   */
  CLAUDE_EXIGE_2FA: booleano,
  N8N_URL: url("N8N_URL", "http://127.0.0.1:5678").default("http://127.0.0.1:5678"),
  N8N_WEBHOOK_SEGREDO: z
    .string({ error: "defina N8N_WEBHOOK_SEGREDO (gere com: openssl rand -hex 32)" })
    .min(32, "N8N_WEBHOOK_SEGREDO precisa ter pelo menos 32 caracteres (gere com: openssl rand -hex 32)"),
  // Obrigatório quando houver mais de uma pessoa cadastrada: diz de quem é o conhecimento do n8n.
  N8N_USUARIO_ID: z.uuid("N8N_USUARIO_ID precisa ser o UUID de uma pessoa").optional(),
  AGENTE_URL: url("AGENTE_URL", "http://127.0.0.1:8081").optional(),
  // O provedor é conferido aqui (erro de digitação derruba cedo); as chaves e URLs de
  // cada provedor (VOYAGE_*, OLLAMA_*) são lidas por @zentrade/conhecimento. nenhum =
  // sem embeddings: a base de conhecimento funciona com busca só por palavras.
  EMBEDDINGS_PROVEDOR: z
    .enum(PROVEDORES_EMBEDDINGS, { error: "EMBEDDINGS_PROVEDOR aceita voyage, ollama ou nenhum" })
    .default("voyage"),
  // Opcional: cotações de FIIs pela brapi.dev. Sem ele, o preço é informado à mão.
  BRAPI_TOKEN: z
    .string()
    .min(8, "BRAPI_TOKEN parece curto demais; copie o token do painel da brapi.dev")
    .optional(),
  APROVACAO_VALIDADE_MIN: z.coerce.number().int().min(1).max(1440).default(15),
  // De quantos em quantos minutos a API importa a carteira da Binance de cada pessoa (0 = só sob demanda).
  CARTEIRA_SINCRONIZAR_MIN: z.coerce.number().int().min(0).max(1440).default(30),
  // De quantos em quantos minutos a API confere a posição dos robôs com o saldo da Binance (0 = só pelo botão).
  RECONCILIACAO_MIN: z.coerce.number().int().min(0).max(1440).default(10),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  // LGPD: quem opera a instância (controlador) e o encarregado. Aparecem na política de
  // privacidade, sem login (GET /api/v1/publico/config). Veja docs/privacidade.md.
  ZENTRADE_CONTROLADOR_NOME: nomeContato("ZENTRADE_CONTROLADOR_NOME"),
  ZENTRADE_CONTROLADOR_EMAIL: emailContato("ZENTRADE_CONTROLADOR_EMAIL"),
  ZENTRADE_ENCARREGADO_NOME: nomeContato("ZENTRADE_ENCARREGADO_NOME"),
  ZENTRADE_ENCARREGADO_EMAIL: emailContato("ZENTRADE_ENCARREGADO_EMAIL"),
});

const Esquema = ConfigBancoEsquema.extend(EsquemaApi.shape);

export type Config = z.infer<typeof Esquema>;

/** Variável vazia (`N8N_USUARIO_ID=` no .env, `${X:-}` no compose) conta como ausente, como no motor. */
export function semVazias(env: Readonly<Record<string, string | undefined>>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(env).filter((par): par is [string, string] => par[1] !== undefined && par[1] !== ""),
  );
}

export function lerConfig(env: NodeJS.ProcessEnv): Config {
  const lido = Esquema.superRefine((c, ctx) => {
    for (const [nome, email] of PARES_LGPD) {
      if ((c[nome] === undefined) !== (c[email] === undefined)) {
        ctx.addIssue({
          code: "custom",
          path: [c[nome] ? email : nome],
          message: `defina ${nome} e ${email} juntos`,
        });
      }
    }
  }).safeParse(semVazias(env));
  if (!lido.success) {
    const problemas = lido.error.issues.map((i) => `- ${i.path.join(".")}: ${i.message}`);
    throw new Error(`configuração da API inválida (veja .env.example):\n${problemas.join("\n")}`);
  }
  return lido.data;
}
