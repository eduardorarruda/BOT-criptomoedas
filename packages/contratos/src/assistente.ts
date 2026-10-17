import { z } from "zod";
import { DocumentoEsquema, DocumentoIngeridoEsquema, EstadoBuscaConhecimento } from "./api.js";
import { CapacidadeTokenClaudeEsquema } from "./claude-token.js";
import { Id, Instante } from "./comum.js";
import { FonteEsquema } from "./proposta.js";
import { FonteDocumento } from "./webhook-esquemas.js";

/**
 * Assistente (chat com os dados da pessoa) e a configuração do analista: qual "cérebro"
 * responde — a API da Anthropic (paga por uso) ou o Claude Code do plano da pessoa
 * (CLI) — e a base de conhecimento por arquivos e links. Rotas em docs/contrato-api.md.
 */

/** "api" = Claude pela API da Anthropic; "cli" = Claude Code (`claude -p`) com o login da pessoa. */
export const ProvedorIa = z.enum(["api", "cli"]);
export type ProvedorIa = z.infer<typeof ProvedorIa>;

/**
 * Nome de modelo: vai como argumento do `claude --model`, então não pode começar com
 * "-" (viraria opção), nem ter espaço ou caractere de shell.
 */
export const ModeloIa = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:/@-]{0,99}$/, "use letras, números e . _ : / @ - (sem começar com -)");

/** Id de uma conta do Claude Code configurada no agente (AGENTE_CLAUDE_CONTAS). */
export const IdContaCli = z
  .string()
  .regex(/^[a-z0-9][a-z0-9_-]{0,39}$/, "use letras minúsculas, números, - e _");

export const ConfigAssistenteEsquema = z.object({
  provedor: ProvedorIa,
  /** null = o padrão do provedor (AGENTE_MODELO na API; o padrão do CLI no Claude Code). */
  modelo: ModeloIa.nullable(),
  /** null = a primeira conta configurada no agente. */
  contaCli: IdContaCli.nullable(),
});
export type ConfigAssistente = z.infer<typeof ConfigAssistenteEsquema>;

export const CONFIG_ASSISTENTE_PADRAO: ConfigAssistente = { provedor: "api", modelo: null, contaCli: null };

/** `PATCH /assistente/config`: só o que muda. Campo desconhecido é recusado. */
export const MudancaConfigAssistenteEsquema = z.strictObject({
  provedor: ProvedorIa.optional(),
  modelo: ModeloIa.nullable().optional(),
  contaCli: IdContaCli.nullable().optional(),
});
export type MudancaConfigAssistente = z.infer<typeof MudancaConfigAssistenteEsquema>;

/** Uma conta do Claude Code (uma pasta de login, CLAUDE_CONFIG_DIR). A pasta nunca sai do agente. */
export const ContaCliEsquema = z.object({
  id: IdContaCli,
  nome: z.string().max(80),
  /** Achou credenciais na pasta de login (indício: o login pode ter expirado mesmo assim). */
  logada: z.boolean(),
});
export type ContaCli = z.infer<typeof ContaCliEsquema>;

export const ModeloSugeridoEsquema = z.object({ id: ModeloIa, nome: z.string(), descricao: z.string() });
export type ModeloSugerido = z.infer<typeof ModeloSugeridoEsquema>;

/** O que o agente informa (`GET /assistente/estado` do agente, rede interna). */
export const EstadoAgenteAssistenteEsquema = z.object({
  provedores: z.object({ api: z.boolean(), cli: z.boolean() }),
  /** Quem atende quem ainda não escolheu: a API se o agente tem a chave; senão o Claude Code. */
  provedorPadrao: ProvedorIa,
  contasCli: z.array(ContaCliEsquema),
  modelos: z.object({ api: z.array(ModeloSugeridoEsquema), cli: z.array(ModeloSugeridoEsquema) }),
  /** O Claude de cada pessoa (token guardado). Ausente = agente antigo, sem isso. */
  tokenClaude: CapacidadeTokenClaudeEsquema.optional(),
});
export type EstadoAgenteAssistente = z.infer<typeof EstadoAgenteAssistenteEsquema>;

/** `GET /assistente/config`: a escolha da pessoa e o que está disponível para escolher. */
export const EstadoAssistenteEsquema = EstadoAgenteAssistenteEsquema.extend({
  config: ConfigAssistenteEsquema,
  /** false = a API não alcançou o agente; provedores e contas vêm vazios. */
  agenteNoAr: z.boolean(),
  /** O final (…abcd) do token do Claude que a pessoa conectou; null = não conectou. */
  tokenClaudeFinal: z.string().max(8).nullable().optional(),
  /** Conectar o Claude exige 2FA nesta instância (o operador pode desligar). Ausente = exige. */
  claudeExige2fa: z.boolean().optional(),
});
export type EstadoAssistente = z.infer<typeof EstadoAssistenteEsquema>;

const UrlHttp = z
  .url({ protocol: /^https?$/ })
  .max(2000)
  .nullable()
  .catch(null);

/** Fonte que a resposta consultou (link só http(s): a tela transforma em link). */
export const FonteCitadaEsquema = FonteEsquema.extend({ url: UrlHttp.optional() });
export type FonteCitada = z.infer<typeof FonteCitadaEsquema>;

export const FerramentaUsadaEsquema = z.object({ nome: z.string().max(80), descricao: z.string().max(300) });
export type FerramentaUsada = z.infer<typeof FerramentaUsadaEsquema>;

export const PapelMensagem = z.enum(["usuario", "assistente"]);
export const SituacaoMensagem = z.enum(["ok", "erro", "interrompida"]);
export const LIMITE_PERGUNTA = 8000;
export const LIMITE_RESPOSTA = 100_000;

export const MensagemAssistenteEsquema = z.object({
  id: Id,
  papel: PapelMensagem,
  texto: z.string().max(LIMITE_RESPOSTA),
  fontes: z.array(FonteCitadaEsquema).max(50),
  ferramentas: z.array(FerramentaUsadaEsquema).max(50),
  situacao: SituacaoMensagem,
  erro: z.string().max(1000).nullable(),
  provedor: ProvedorIa.nullable(),
  modelo: z.string().max(100).nullable(),
  criadaEm: Instante,
});
export type MensagemAssistente = z.infer<typeof MensagemAssistenteEsquema>;

export const ConversaResumoEsquema = z.object({
  id: Id,
  titulo: z.string().max(120),
  previa: z.string().max(200),
  criadaEm: Instante,
  atualizadaEm: Instante,
});
export type ConversaResumo = z.infer<typeof ConversaResumoEsquema>;

export const ConversaEsquema = ConversaResumoEsquema.extend({
  mensagens: z.array(MensagemAssistenteEsquema),
});
export type Conversa = z.infer<typeof ConversaEsquema>;

export const NovaConversaEsquema = z.strictObject({ titulo: z.string().trim().min(1).max(120).optional() });
export const MudancaConversaEsquema = z.strictObject({ titulo: z.string().trim().min(1).max(120) });
export const NovaMensagemEsquema = z.strictObject({ texto: z.string().trim().min(1).max(LIMITE_PERGUNTA) });

/** Pedido da API ao agente (rede interna): a pergunta e o histórico recente da conversa. */
export const PedidoRespostaAgenteEsquema = z.object({
  usuarioId: z.uuid(),
  historico: z.array(z.object({ papel: PapelMensagem, texto: z.string().max(LIMITE_RESPOSTA) })).max(40),
  pergunta: z.string().min(1).max(LIMITE_PERGUNTA),
});
export type PedidoRespostaAgente = z.infer<typeof PedidoRespostaAgenteEsquema>;

const EventoTexto = z.object({ tipo: z.literal("texto"), delta: z.string() });
const EventoFerramenta = z.object({ tipo: z.literal("ferramenta"), ...FerramentaUsadaEsquema.shape });
const EventoFontes = z.object({ tipo: z.literal("fontes"), fontes: z.array(FonteCitadaEsquema).max(50) });

/** O que o agente manda, uma linha JSON por evento, enquanto responde. */
export const EventoRespostaAgenteEsquema = z.discriminatedUnion("tipo", [
  EventoTexto,
  EventoFerramenta,
  EventoFontes,
  z.object({ tipo: z.literal("erro"), codigo: z.string().max(60), mensagem: z.string().max(1000) }),
  z.object({ tipo: z.literal("concluido"), provedor: ProvedorIa, modelo: z.string().max(100).nullable() }),
]);
export type EventoRespostaAgente = z.infer<typeof EventoRespostaAgenteEsquema>;

/**
 * O que a API manda para a tela (SSE, `data: <json>`): a mensagem da pessoa já gravada,
 * os pedaços da resposta e, no fim, a resposta gravada (com erro, se houve).
 */
export const EventoChatEsquema = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("inicio"), usuario: MensagemAssistenteEsquema }),
  EventoTexto,
  EventoFerramenta,
  EventoFontes,
  z.object({ tipo: z.literal("fim"), mensagem: MensagemAssistenteEsquema }),
]);
export type EventoChat = z.infer<typeof EventoChatEsquema>;

// --- Base de conhecimento por arquivos e links ---

export const TIPOS_ARQUIVO = ["pdf", "docx", "md", "txt", "html"] as const;
export const TipoArquivo = z.enum(TIPOS_ARQUIVO);
export type TipoArquivo = z.infer<typeof TipoArquivo>;
/** 15 MB por arquivo enviado (o corpo da requisição). */
export const LIMITE_ARQUIVO_BYTES = 15 * 1024 * 1024;

/** De onde o documento veio: texto escrito na tela, arquivo, link baixado ou automação (n8n). */
export const OrigemDocumento = z.enum(["texto", "arquivo", "link", "automacao"]);
export type OrigemDocumento = z.infer<typeof OrigemDocumento>;

export const DocumentoDetalheEsquema = DocumentoEsquema.extend({
  origem: OrigemDocumento,
  nomeArquivo: z.string().max(255).nullable(),
  tipoArquivo: TipoArquivo.nullable(),
  bytes: z.number().int().nonnegative().nullable(),
  trechos: z.number().int().nonnegative(),
});
export type DocumentoDetalhe = z.infer<typeof DocumentoDetalheEsquema>;

export const TrechoDocumentoEsquema = z.object({ id: Id, ordem: z.number().int(), texto: z.string() });
export type TrechoDocumento = z.infer<typeof TrechoDocumentoEsquema>;

/** `GET /conhecimento/documentos/:id`: o documento e os trechos que entraram no RAG. */
export const DocumentoComTrechosEsquema = z.object({
  documento: DocumentoDetalheEsquema,
  trechos: z.array(TrechoDocumentoEsquema),
});
export type DocumentoComTrechos = z.infer<typeof DocumentoComTrechosEsquema>;

/**
 * Como a busca no conhecimento roda: `hibrida` (semântica + palavras) ou `palavras`
 * (sem embeddings configurados: EMBEDDINGS_PROVEDOR=nenhum, só o full-text).
 */
export const ModoBuscaConhecimento = z.enum(["hibrida", "palavras"]);
export type ModoBuscaConhecimento = z.infer<typeof ModoBuscaConhecimento>;

/** `GET /conhecimento/estado`: em que modo a busca está e quantos trechos esperam a reindexação. */
export const EstadoConhecimentoEsquema = z.object({
  busca: EstadoBuscaConhecimento,
  /** Trechos da pessoa gravados sem vetor; `reindexar-conhecimento` calcula quando houver provedor. */
  trechosSemVetor: z.number().int().nonnegative(),
  /** Por que a base está desligada; `null` quando funciona. */
  motivo: z.string().nullable(),
});
export type EstadoConhecimento = z.infer<typeof EstadoConhecimentoEsquema>;

/** Resultado de `GET /conhecimento/busca?q=`: os trechos mais parecidos da base da pessoa. */
export const ResultadoBuscaConhecimentoEsquema = z.object({
  trechoId: Id,
  documentoId: Id,
  fonte: FonteDocumento,
  titulo: z.string(),
  url: UrlHttp,
  publicadoEm: Instante,
  texto: z.string(),
  pontuacao: z.number(),
  modo: ModoBuscaConhecimento,
});
export type ResultadoBuscaConhecimento = z.infer<typeof ResultadoBuscaConhecimentoEsquema>;

/** `POST /conhecimento/links`: a página é baixada pela API (só http/https, nunca rede interna). */
export const NovoLinkEsquema = z.strictObject({
  url: z.url({ protocol: /^https?$/, error: "use um endereço http:// ou https://" }).max(2000),
  titulo: z.string().trim().min(1).max(200).optional(),
  fonte: FonteDocumento.default("nota"),
});
export type NovoLink = z.input<typeof NovoLinkEsquema>;

/** Arquivo ou link ingerido: o documento e o que a extração fez com o texto. */
export const ArquivoIngeridoEsquema = DocumentoIngeridoEsquema.extend({
  caracteres: z.number().int().nonnegative(),
  /** O texto passou do limite e só o começo entrou no RAG. */
  truncado: z.boolean(),
});
export type ArquivoIngerido = z.infer<typeof ArquivoIngeridoEsquema>;
