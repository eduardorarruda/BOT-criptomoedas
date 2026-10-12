import { z } from "zod";
import { Fracao, Id, Instante, Intervalo, Lado, ModoRobo, Rede, TextoDecimal } from "./comum.js";
import { PropostaAgenteEsquema } from "./proposta.js";
import { RegraEsquema } from "./regra.js";

/** Formatos que trafegam entre API, tela, motor e n8n. Decimais sempre em texto. */
export const EstrategiaEsquema = z.object({
  id: Id,
  nome: z.string().min(1).max(80),
  versao: z.number().int().positive(),
  entrada: RegraEsquema,
  saida: RegraEsquema.optional(),
  stop: z.number().gt(0).lt(0.5),
  alvoLiquido: z.number().gt(0).lt(1),
  taxa: z.number().min(0).lt(0.01),
});
export type EstrategiaDTO = z.infer<typeof EstrategiaEsquema>;

export const LimitesRiscoEsquema = z.object({
  perdaDiariaMaxima: TextoDecimal,
  exposicaoMaxima: TextoDecimal,
  riscoPorOperacao: TextoDecimal,
  ordensPorHoraMax: z.number().int().min(1).max(120),
  pausaAposPerdaMin: z.number().int().min(0).max(1440),
  confiancaMinima: Fracao,
});
export type LimitesRiscoDTO = z.infer<typeof LimitesRiscoEsquema>;

export const RoboEsquema = z.object({
  id: Id,
  nome: z.string().min(1).max(80),
  simbolo: z.string().regex(/^[A-Z0-9]{5,20}$/),
  intervalo: Intervalo,
  modo: ModoRobo,
  rede: Rede,
  estrategiaId: Id,
  estrategiaVersao: z.number().int().positive(),
  limites: LimitesRiscoEsquema,
  pausado: z.boolean(),
  criadoEm: Instante,
});
export type RoboDTO = z.infer<typeof RoboEsquema>;

export const BarreiraEsquema = z.object({ codigo: z.string(), mensagem: z.string() });

export const EstadoDecisao = z.enum([
  "registrada", // modo observar: só fica no diário
  "barrada", // o risco recusou
  "aguardando_aprovacao", // modo sugerir
  "aprovada",
  "recusada",
  "expirada",
  "executada",
  "falhou",
]);
export type EstadoDecisao = z.infer<typeof EstadoDecisao>;

export const DecisaoEsquema = z.object({
  id: Id,
  roboId: Id,
  em: Instante,
  sinal: z.object({ acao: z.enum(["COMPRAR", "VENDER", "AGUARDAR"]), explicacao: z.string() }),
  proposta: PropostaAgenteEsquema.optional(),
  quantidade: TextoDecimal.optional(),
  preco: TextoDecimal,
  risco: z.object({ aprovada: z.boolean(), barreiras: z.array(BarreiraEsquema) }),
  estado: EstadoDecisao,
  ordemId: Id.optional(),
  custoIaUsd: TextoDecimal.optional(),
  desfecho: z.object({ resultado: TextoDecimal, avaliadoEm: Instante }).optional(),
});
export type DecisaoDTO = z.infer<typeof DecisaoEsquema>;

export const ExecucaoEsquema = z.object({
  preco: TextoDecimal,
  quantidade: TextoDecimal,
  taxaCotacao: TextoDecimal,
  em: Instante,
});

export const EstadoOrdem = z.enum(["PENDENTE", "PARCIAL", "PREENCHIDA", "REJEITADA", "CANCELADA"]);
export type EstadoOrdem = z.infer<typeof EstadoOrdem>;

export const OrdemEsquema = z.object({
  id: Id,
  decisaoId: Id,
  idCliente: z.string().regex(/^[a-zA-Z0-9-_]{1,36}$/), // limite da Binance para newClientOrderId
  simbolo: z.string(),
  lado: Lado,
  quantidade: TextoDecimal,
  estado: EstadoOrdem,
  motivo: z.string().optional(),
  criadaEm: Instante,
  execucoes: z.array(ExecucaoEsquema),
});
export type OrdemDTO = z.infer<typeof OrdemEsquema>;

/**
 * A última proteção que o motor deixou na corretora para o robô ("Stop na corretora:
 * ativo a X"). ATIVA é a que vale; PENDENTE, confirmando; REJEITADA traz o motivo.
 */
export const ProtecaoCorretoraEsquema = z.object({
  estado: z.enum(["PENDENTE", "ATIVA", "EXECUTADA", "CANCELADA", "REJEITADA"]),
  stop: TextoDecimal,
  limite: TextoDecimal,
  alvo: TextoDecimal.optional(),
  quantidade: TextoDecimal,
  motivo: z.string().optional(),
  atualizadaEm: Instante,
});
export type ProtecaoCorretoraDTO = z.infer<typeof ProtecaoCorretoraEsquema>;

export const PosicaoEsquema = z.object({
  roboId: Id,
  simbolo: z.string(),
  quantidade: TextoDecimal,
  precoMedio: TextoDecimal,
  resultadoRealizado: TextoDecimal,
  taxasPagas: TextoDecimal,
  protecaoCorretora: ProtecaoCorretoraEsquema.optional(),
});
export type PosicaoDTO = z.infer<typeof PosicaoEsquema>;
