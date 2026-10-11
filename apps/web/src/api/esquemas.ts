import { Id, Instante, Intervalo, Rede, TextoDecimal } from "@zentrade/contratos";
import { z } from "zod";

/**
 * Formatos de respostas que o contrato descreve em docs/contrato-api.md mas que
 * ainda não têm esquema em @zentrade/contratos. Ficam aqui até irem para lá (veja
 * "mudanças de contrato propostas" no relatório da tela).
 */
export const ErroRespostaEsquema = z.object({
  erro: z.object({ codigo: z.string(), mensagem: z.string() }),
});

export const UsuarioEsquema = z.object({
  id: Id,
  email: z.string(),
  nome: z.string().optional(),
});
export type Usuario = z.infer<typeof UsuarioEsquema>;
export const SessaoEsquema = z.object({ usuario: UsuarioEsquema });

export const ResumoEsquema = z.object({
  resultadoHoje: TextoDecimal,
  exposicao: TextoDecimal,
  maiorQueda30d: TextoDecimal,
  robosAtivos: z.number().int().nonnegative(),
  custoIaHoje: TextoDecimal,
  paradaTotal: z.boolean(),
  taxasHoje: TextoDecimal.optional(),
});
export type Resumo = z.infer<typeof ResumoEsquema>;

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

export const ContaCorretoraEsquema = z.object({
  id: Id,
  corretora: z.literal("binance"),
  rede: Rede,
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
  ultimoUsoEm: Instante.nullable().optional(),
});
export type TokenApi = z.infer<typeof TokenApiEsquema>;
export const TokenCriadoEsquema = TokenApiEsquema.extend({ token: z.string().min(16) });
export type TokenCriado = z.infer<typeof TokenCriadoEsquema>;

export const FonteDocumento = z.enum(["diario", "noticia", "regra_corretora", "estrategia", "nota"]);
export type FonteDocumento = z.infer<typeof FonteDocumento>;
export const DocumentoEsquema = z.object({
  id: Id,
  fonte: FonteDocumento,
  titulo: z.string(),
  url: z.string().optional(),
  publicadoEm: Instante,
  trechos: z.number().int().nonnegative().optional(),
});
export type Documento = z.infer<typeof DocumentoEsquema>;

export const EstadoBacktest = z.enum(["na_fila", "rodando", "concluido", "falhou"]);
export const MetricasBacktestEsquema = z.object({
  resultado: TextoDecimal,
  resultadoPercentual: TextoDecimal,
  maiorQueda: TextoDecimal,
  taxas: TextoDecimal,
  operacoes: z.number().int().nonnegative(),
  acertos: z.number().int().nonnegative(),
});
export const BacktestEsquema = z.object({
  id: Id,
  estado: EstadoBacktest,
  estrategiaId: Id.optional(),
  versao: z.number().int().positive().optional(),
  simbolo: z.string().optional(),
  intervalo: Intervalo.optional(),
  inicio: Instante.optional(),
  fim: Instante.optional(),
  capitalInicial: TextoDecimal.optional(),
  metricas: MetricasBacktestEsquema.optional(),
  curva: z.array(PontoPatrimonioEsquema).optional(),
  erro: z.string().optional(),
});
export type Backtest = z.infer<typeof BacktestEsquema>;

export const AutomacaoEsquema = z.object({
  id: Id,
  nome: z.string(),
  descricao: z.string(),
  ativa: z.boolean(),
  ultimaExecucaoEm: Instante.nullable(),
  ultimoResultado: z.enum(["ok", "falhou", "nunca"]),
  falhas24h: z.number().int().nonnegative(),
});
export type Automacao = z.infer<typeof AutomacaoEsquema>;

export const SaudeEsquema = z.object({
  ok: z.boolean(),
  servicos: z.object({ banco: z.boolean(), redis: z.boolean(), motor: z.boolean(), agente: z.boolean() }),
});
export type Saude = z.infer<typeof SaudeEsquema>;

/**
 * Passo a passo do agente enquanto analisa (proposta: ainda não está no contrato).
 * A tela mostra cada ferramenta consultada, ao vivo, no cartão "pensando".
 */
export const EventoAnaliseEsquema = z.object({
  tipo: z.literal("analise"),
  analiseId: Id,
  roboId: Id,
  etapa: z.object({ ferramenta: z.string(), descricao: z.string(), em: Instante }).optional(),
  concluida: z.boolean(),
  decisaoId: Id.optional(),
});
export type EventoAnalise = z.infer<typeof EventoAnaliseEsquema>;
