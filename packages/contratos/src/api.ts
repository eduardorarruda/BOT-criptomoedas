import { z } from "zod";
import { Id, Instante, TextoDecimal } from "./comum.js";
import { DecisaoEsquema, OrdemEsquema } from "./dados.js";
import { FonteDocumento } from "./webhook-esquemas.js";

/**
 * Respostas da API REST (`/api/v1`) que a tela, a CLI e o MCP leem. Rotas e regras
 * de acesso em docs/contrato-api.md. Decimais em texto; instantes em ms UTC.
 */

/** `{ "erro": { "codigo", "mensagem" } }`: todo erro da API vem neste envelope. */
export const ErroRespostaEsquema = z.object({
  erro: z.object({ codigo: z.string(), mensagem: z.string() }),
});
export type ErroResposta = z.infer<typeof ErroRespostaEsquema>;

/** Códigos de erro que quem chama costuma tratar de forma especial. */
export const CODIGOS_ERRO = {
  naoAutenticado: "nao_autenticado",
  codigo2faNecessario: "codigo2fa_necessario",
  reautenticacaoNecessaria: "reautenticacao_necessaria",
  csrfInvalido: "csrf_invalido",
} as const;

export const UsuarioEsquema = z.object({
  id: Id,
  email: z.string(),
  nome: z.string(),
  doisFatores: z.boolean(),
});
export type Usuario = z.infer<typeof UsuarioEsquema>;

/** `POST /sessao` e `GET /sessao`. `csrf` vai no cabeçalho `x-csrf-token` de toda escrita. */
export const SessaoEsquema = z.object({ usuario: UsuarioEsquema, csrf: z.string().min(16) });
export type Sessao = z.infer<typeof SessaoEsquema>;

/** `POST /sessao/2fa`: segredo TOTP e a URI `otpauth://` para o app autenticador. */
export const SegredoDoisFatoresEsquema = z.object({ segredo: z.string(), uri: z.string() });

export const ResumoEsquema = z.object({
  resultadoHoje: TextoDecimal,
  exposicao: TextoDecimal,
  maiorQueda30d: TextoDecimal,
  robosAtivos: z.number().int().nonnegative(),
  custoIaHoje: TextoDecimal,
  /** Taxas pagas hoje (dia UTC), na moeda de cotação, somadas das execuções. */
  taxasHoje: TextoDecimal,
  paradaTotal: z.boolean(),
});
export type Resumo = z.infer<typeof ResumoEsquema>;

/** Um ponto da curva de `GET /patrimonio`: resultado realizado acumulado até o fim do dia `em`. */
export const PontoPatrimonioEsquema = z.object({ em: Instante, valor: TextoDecimal });
export type PontoPatrimonio = z.infer<typeof PontoPatrimonioEsquema>;

export const CandleApiEsquema = z.object({
  abertura: Instante,
  abre: TextoDecimal,
  maxima: TextoDecimal,
  minima: TextoDecimal,
  fecha: TextoDecimal,
  volume: TextoDecimal,
});
export type CandleApi = z.infer<typeof CandleApiEsquema>;

export const ParadaTotalEsquema = z.object({ ligada: z.boolean() });

export const DecisaoDetalheEsquema = DecisaoEsquema.extend({ ordem: OrdemEsquema.optional() });
export type DecisaoDetalhe = z.infer<typeof DecisaoDetalheEsquema>;

/** Conta na corretora. O segredo nunca sai da API: só o final da chave. */
export const ContaCorretoraEsquema = z.object({
  id: Id,
  corretora: z.literal("binance"),
  rede: z.enum(["testnet", "real"]),
  apiKeyFinal: z.string(),
  criadaEm: Instante,
});
export type ContaCorretora = z.infer<typeof ContaCorretoraEsquema>;

export const EscopoToken = z.enum(["leitura", "operar"]);
export type EscopoToken = z.infer<typeof EscopoToken>;

export const TokenApiEsquema = z.object({
  id: Id,
  nome: z.string(),
  escopo: EscopoToken,
  criadoEm: Instante,
  ultimoUsoEm: Instante.nullable(),
});
export type TokenApi = z.infer<typeof TokenApiEsquema>;

/** Só na criação: o token em claro aparece esta única vez. */
export const TokenCriadoEsquema = TokenApiEsquema.extend({ token: z.string().min(16) });
export type TokenCriado = z.infer<typeof TokenCriadoEsquema>;

/**
 * A tela transforma a url em link: só http(s) passa. Qualquer outra coisa (javascript:,
 * data:...) vira null — o documento continua na lista, sem link, em vez de virar XSS.
 */
const UrlDeDocumento = z
  .url({ protocol: /^https?$/ })
  .nullable()
  .catch(null);

export const DocumentoEsquema = z.object({
  id: Id,
  fonte: FonteDocumento,
  titulo: z.string(),
  url: UrlDeDocumento,
  publicadoEm: Instante,
  criadoEm: Instante,
});
export type Documento = z.infer<typeof DocumentoEsquema>;

/** `POST /conhecimento/notas`: o documento e o que a ingestão fez. `novo: false` = conteúdo repetido. */
export const DocumentoIngeridoEsquema = DocumentoEsquema.extend({
  novo: z.boolean(),
  trechos: z.number().int().nonnegative(),
});
export type DocumentoIngerido = z.infer<typeof DocumentoIngeridoEsquema>;

export const SaudeEsquema = z.object({
  ok: z.boolean(),
  servicos: z.object({ banco: z.boolean(), redis: z.boolean(), motor: z.boolean(), agente: z.boolean() }),
});
export type Saude = z.infer<typeof SaudeEsquema>;

/**
 * Status de um fluxo do n8n, derivado dos sinais que a API viu: webhooks assinados
 * recebidos e avisos que ela mesma enviou ao n8n. A API não consulta o n8n.
 */
export const AutomacaoEsquema = z.object({
  id: Id,
  nome: z.string(),
  descricao: z.string(),
  /** Deu sinal dentro do intervalo esperado (fluxos agendados) ou já deu sinal (fluxos por evento). */
  ativa: z.boolean(),
  ultimaExecucaoEm: Instante.nullable(),
  ultimoResultado: z.enum(["ok", "falhou", "nunca"]),
  falhas24h: z.number().int().nonnegative(),
});
export type Automacao = z.infer<typeof AutomacaoEsquema>;
