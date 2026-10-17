import { z } from "zod";
import { Instante } from "./comum.js";

/**
 * O Claude da própria pessoa, conectado pela tela: o token de longa duração que o
 * `claude setup-token` gera (válido por 1 ano, só faz chamadas ao modelo). O agente o usa
 * em CLAUDE_CODE_OAUTH_TOKEN ao rodar o Claude Code por ela. Guardado cifrado no banco;
 * nenhuma rota devolve o token, só o final. Rotas em docs/contrato-api.md.
 */

const MINIMO_TOKEN = 50;
const MAXIMO_TOKEN = 400;
/** sk-ant-oat01-…: o número da versão pode mudar, o resto não. */
const FORMATO_TOKEN = /^sk-ant-oat[A-Za-z0-9]*-[A-Za-z0-9_-]+$/;
const CHAVE_DA_API = /^sk-ant-api/;
const FORMATO_ERRADO =
  "isso não parece o token do Claude Code: ele começa com sk-ant-oat e tem só letras, números, - e _. Copie de novo a linha inteira que o claude setup-token mostrou";

/** O token colado: aparado e sem as quebras de linha que o terminal costuma colar junto. */
export const TokenClaude = z
  .string()
  .max(MAXIMO_TOKEN * 2, "o texto colado é longo demais para ser o token")
  .transform((t) => t.replace(/\s+/g, ""))
  .superRefine((t, ctx) => {
    if (CHAVE_DA_API.test(t)) {
      ctx.addIssue({
        code: "custom",
        message:
          "isso é uma chave da API da Anthropic (sk-ant-api…), que cobra por uso. Para usar o seu plano, conecte pelo botão ou rode claude setup-token e cole o que começa com sk-ant-oat",
      });
      return;
    }
    if (t.length < MINIMO_TOKEN || t.length > MAXIMO_TOKEN || !FORMATO_TOKEN.test(t)) {
      ctx.addIssue({ code: "custom", message: FORMATO_ERRADO });
    }
  });

/** `PUT /assistente/claude-token`. */
export const NovoTokenClaudeEsquema = z.strictObject({ token: TokenClaude });

/** "…abcd": o que a tela mostra para a pessoa reconhecer o token. */
export const finalDoToken = (token: string): string => `…${token.slice(-4)}`;

const QUALQUER_TOKEN_ANTHROPIC = /sk-ant-[A-Za-z0-9_-]+/g;

/** Troca qualquer token ou chave da Anthropic por "sk-ant-[oculto]" (para logs e erros). */
export const ocultarTokensClaude = (texto: string): string =>
  texto.replace(QUALQUER_TOKEN_ANTHROPIC, "sk-ant-[oculto]");

export const OrigemTokenClaude = z.enum(["conexao", "colado"]);
export type OrigemTokenClaude = z.infer<typeof OrigemTokenClaude>;

/** `GET /assistente/claude-token`: se há token, o final dele e como foi o último teste. */
export const EstadoTokenClaudeEsquema = z.object({
  configurado: z.boolean(),
  final: z
    .string()
    .regex(/^…[A-Za-z0-9_-]{4}$/)
    .nullable(),
  /** "conexao" = pelo botão (o agente rodou o setup-token); "colado" = a pessoa colou. */
  origem: OrigemTokenClaude.nullable(),
  criadaEm: Instante.nullable(),
  /** Só quando a conexão foi pelo botão: o token vale 1 ano a partir dali. */
  validoAte: Instante.nullable(),
  validadaEm: Instante.nullable(),
  ultimoErro: z.string().max(500).nullable(),
});
export type EstadoTokenClaude = z.infer<typeof EstadoTokenClaudeEsquema>;

export const ESTADO_TOKEN_CLAUDE_VAZIO: EstadoTokenClaude = {
  configurado: false,
  final: null,
  origem: null,
  criadaEm: null,
  validoAte: null,
  validadaEm: null,
  ultimoErro: null,
};

/** Validade do token que o `claude setup-token` gera. */
export const VALIDADE_TOKEN_CLAUDE_MS = 365 * 86_400_000;

const DOMINIOS_ANTHROPIC = ["claude.ai", "claude.com", "anthropic.com"] as const;

/**
 * A página de autorização só pode ser da Anthropic, por https: o agente nunca manda para
 * o navegador um link qualquer que tenha aparecido na saída do CLI.
 */
export function urlAutorizacaoClaudeValida(texto: string): boolean {
  let url: URL;
  try {
    url = new URL(texto);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username !== "" || url.password !== "" || url.port !== "") {
    return false;
  }
  const host = url.hostname.toLowerCase();
  return DOMINIOS_ANTHROPIC.some((d) => host === d || host.endsWith(`.${d}`));
}

export const UrlAutorizacaoClaude = z
  .string()
  .max(4000)
  .refine(urlAutorizacaoClaudeValida, "a autorização precisa ser num endereço https da Anthropic");

/** `POST /assistente/claude-token/conexao`: a conexão aberta e o link para autorizar. */
export const ConexaoClaudeEsquema = z.object({
  conexaoId: z.uuid(),
  urlAutorizacao: UrlAutorizacaoClaude,
  expiraEm: Instante,
});
export type ConexaoClaude = z.infer<typeof ConexaoClaudeEsquema>;

/**
 * O código que a página do Claude mostra depois de autorizar ("abc…#xyz…"). Vai para o
 * terminal do CLI: só letras, números e # - _ . ~ (nada de Enter, Esc ou espaço no meio).
 */
export const CodigoAutorizacaoClaude = z
  .string()
  .trim()
  .regex(
    /^[A-Za-z0-9._~#-]{8,600}$/,
    "cole o código exatamente como o Claude mostrou (letras, números e # - _ . ~)",
  );

export const CodigoConexaoClaudeEsquema = z.strictObject({ codigo: CodigoAutorizacaoClaude });

/** `POST /assistente/claude-token/testar`: a chamada mínima com o token deu certo? */
export const ResultadoTesteClaudeEsquema = z.object({
  ok: z.boolean(),
  /** Em frase, para a pessoa; nunca o token nem a saída crua do CLI. */
  mensagem: z.string().max(500).nullable(),
});
export type ResultadoTesteClaude = z.infer<typeof ResultadoTesteClaudeEsquema>;

/** O que a API devolve no teste: o resultado e o estado já com validada_em ou ultimo_erro. */
export const TesteTokenClaudeEsquema = ResultadoTesteClaudeEsquema.extend({
  estado: EstadoTokenClaudeEsquema,
});
export type TesteTokenClaude = z.infer<typeof TesteTokenClaudeEsquema>;

/** O que o agente pode fazer com o token de cada pessoa (vai no estado do assistente). */
export const CapacidadeTokenClaudeEsquema = z.object({
  /** O agente tem o Claude Code e a chave mestra: usa o token guardado de cada pessoa. */
  usar: z.boolean(),
  /** Além disso, tem o `script` (pseudo-terminal): conecta pelo botão, sem terminal. */
  conectar: z.boolean(),
});
export type CapacidadeTokenClaude = z.infer<typeof CapacidadeTokenClaudeEsquema>;

// --- Pedidos da API ao agente (rede interna, Bearer AGENTE_SEGREDO) ---

/** O usuarioId vem sempre da sessão na API, nunca do corpo que a tela manda. */
export const PedidoClaudeAgenteEsquema = z.object({ usuarioId: z.uuid() });
export const PedidoCodigoClaudeAgenteEsquema = PedidoClaudeAgenteEsquema.extend({
  codigo: CodigoAutorizacaoClaude,
});
