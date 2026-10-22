import type { Estrategia } from "@zentrade/dominio";
import { z } from "zod";
import { Fracao, Id, Instante, Intervalo, Lado, ModoRobo, Rede, TextoDecimal } from "./comum.js";
import { ModoDiasDeEventoEsquema } from "./agenda-eventos.js";
import { CondicaoEsquema, LeituraCenarioEsquema } from "./pensamento.js";
import { AvaliacaoDecisaoEsquema } from "./placar.js";
import { PropostaAgenteEsquema } from "./proposta.js";
import { RegraEsquema } from "./regra.js";

/** Um uso do ATR: período do indicador e quantos ATR (stop, stop móvel, tamanho). */
const UsoAtr = z.object({
  periodo: z.number().int().min(1).max(500),
  multiplo: z.number().gt(0).max(20),
});

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
  stopAtr: UsoAtr.optional(),
  stopMovel: z
    .discriminatedUnion("tipo", [
      z.object({ tipo: z.literal("percentual"), distancia: z.number().gt(0).lt(0.5) }),
      UsoAtr.extend({ tipo: z.literal("atr") }),
    ])
    .optional(),
  empate: z.object({ gatilho: z.number().gt(0).lt(1) }).optional(),
  tempoMaximo: z.number().int().min(1).max(1000).optional(),
  tamanhoPorVolatilidade: UsoAtr.optional(),
  /** Tamanho por alocação: fração (até 100%) da exposição máxima do robô, sem olhar o risco por operação. */
  tamanhoPorAlocacao: z.object({ fracao: z.number().gt(0).max(1) }).optional(),
  /** Sem ela, comprado. Vendido e ambos só rodam no mini índice (o à vista não vende a descoberto). */
  direcao: z.enum(["comprado", "vendido", "ambos"]).optional(),
  entradaVendida: RegraEsquema.optional(),
  saidaVendida: RegraEsquema.optional(),
});
export type EstrategiaDTO = z.infer<typeof EstrategiaEsquema>;

/** O que define o comportamento da estratégia (sem id, nome e versão). */
export type CamposEstrategia = Omit<EstrategiaDTO, "id" | "nome" | "versao">;

/**
 * DTO → estratégia do domínio. O DTO aceita `campo: undefined` nos opcionais; o
 * domínio quer a chave ausente (exactOptionalPropertyTypes). Também tira id, nome e
 * versão, que não mudam decisão nenhuma.
 */
export function estrategiaDoDTO(e: CamposEstrategia): Estrategia {
  const { entrada, stop, alvoLiquido, taxa } = e;
  return {
    entrada,
    stop,
    alvoLiquido,
    taxa,
    ...(e.saida ? { saida: e.saida } : {}),
    ...(e.stopAtr ? { stopAtr: e.stopAtr } : {}),
    ...(e.stopMovel ? { stopMovel: e.stopMovel } : {}),
    ...(e.empate ? { empate: e.empate } : {}),
    ...(e.tempoMaximo !== undefined ? { tempoMaximo: e.tempoMaximo } : {}),
    ...(e.tamanhoPorVolatilidade ? { tamanhoPorVolatilidade: e.tamanhoPorVolatilidade } : {}),
    ...(e.tamanhoPorAlocacao ? { tamanhoPorAlocacao: e.tamanhoPorAlocacao } : {}),
    ...(e.direcao ? { direcao: e.direcao } : {}),
    ...(e.entradaVendida ? { entradaVendida: e.entradaVendida } : {}),
    ...(e.saidaVendida ? { saidaVendida: e.saidaVendida } : {}),
  };
}

export const ModoAgenteEsquema = z.enum(["decide", "desligado"]);

export const LimitesRiscoEsquema = z.object({
  perdaDiariaMaxima: TextoDecimal,
  exposicaoMaxima: TextoDecimal,
  riscoPorOperacao: TextoDecimal,
  ordensPorHoraMax: z.number().int().min(1).max(120),
  pausaAposPerdaMin: z.number().int().min(0).max(1440),
  confiancaMinima: Fracao,
  /** Filtro opcional de dia de evento (Copom, payroll…): ignorar (padrão), bloquear entradas ou reduzir à metade. */
  diasDeEvento: ModoDiasDeEventoEsquema.default("ignorar"),
  /** O Claude no ciclo do robô: decide (analisa e pode vetar, padrão) ou desligado (só a regra, sem custo de IA). */
  agente: ModoAgenteEsquema.default("decide"),
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
  /** O placar do Claude nesta decisão: o que ele decidiu e como terminou (real ou contrafactual). */
  avaliacao: AvaliacaoDecisaoEsquema.optional(),
  /** O cenário de mercado no momento da decisão. Decisões antigas não têm. */
  regime: LeituraCenarioEsquema.optional(),
  /** A regra aberta em condições (✓/✗ com valores) naquele momento. Decisões antigas não têm. */
  condicoes: CondicaoEsquema.optional(),
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
