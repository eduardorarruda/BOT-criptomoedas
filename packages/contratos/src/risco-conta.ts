import { z } from "zod";
import { Id, Instante, Rede, TextoDecimal } from "./comum.js";

/**
 * Limites da conta, reconciliação com a corretora, orçamento de IA e avisos
 * (`/api/v1/risco/...` e `/api/v1/avisos`). Decimais em texto; instantes em ms UTC.
 * As regras ficam em @zentrade/dominio (risco-conta.ts, reconciliacao.ts).
 */

/** Valor positivo em texto ("100", "12.5"): limite em US$ não pode ser zero nem negativo. */
const ValorPositivo = TextoDecimal.refine((t) => Number(t) > 0, "precisa ser maior que zero");

export const EscopoSequencia = z.enum(["robo", "conta", "ambos"]);
export type EscopoSequencia = z.infer<typeof EscopoSequencia>;

/**
 * `GET/PUT /risco/limites-conta`: os limites da pessoa, somando os robôs dela na mesma
 * rede, e o orçamento de IA. `null` = sem limite.
 */
export const LimitesContaEsquema = z.object({
  /** Perda máxima do dia (00:00 a 23:59 UTC, 21h às 20h59 de Brasília), em US$. */
  perdaDiariaMaxima: ValorPositivo.nullable(),
  incluirNaoRealizado: z.boolean(),
  exposicaoMaxima: ValorPositivo.nullable(),
  posicoesAbertasMax: z.number().int().min(1).max(100).nullable(),
  /** Queda máxima do pico do resultado, em US$, dentro da janela. */
  quedaMaxima: ValorPositivo.nullable(),
  quedaJanelaHoras: z.number().int().min(1).max(720),
  /** StoplossGuard: N saídas com perda em X horas pausam as compras. */
  sequenciaStopsMax: z.number().int().min(1).max(50).nullable(),
  sequenciaStopsJanelaHoras: z.number().int().min(1).max(168),
  sequenciaStopsEscopo: EscopoSequencia,
  /** Teto de gasto com IA (análises + assistente) no mês UTC, em US$. */
  orcamentoIaMensalUsd: ValorPositivo.nullable(),
  /** Teto opcional por dia UTC, em US$. */
  orcamentoIaDiarioUsd: ValorPositivo.nullable(),
});
export type LimitesContaDTO = z.infer<typeof LimitesContaEsquema>;

export const LIMITES_CONTA_PADRAO: LimitesContaDTO = {
  perdaDiariaMaxima: null,
  incluirNaoRealizado: false,
  exposicaoMaxima: null,
  posicoesAbertasMax: null,
  quedaMaxima: null,
  quedaJanelaHoras: 72,
  sequenciaStopsMax: null,
  sequenciaStopsJanelaHoras: 24,
  sequenciaStopsEscopo: "ambos",
  orcamentoIaMensalUsd: null,
  orcamentoIaDiarioUsd: null,
};

export const CodigoPausa = z.enum([
  "conta_perda_diaria",
  "conta_queda",
  "sequencia_stops",
  "sequencia_stops_robo",
  "divergencia_saldo",
  "orcamento_ia",
]);
export type CodigoPausa = z.infer<typeof CodigoPausa>;

/** Uma pausa de compras em vigor, com o motivo e quando acaba. */
export const PausaContaEsquema = z.object({
  codigo: CodigoPausa,
  /** A conta (rede) pausada; `null` quando vale para todas (orçamento de IA). */
  rede: Rede.nullable(),
  roboId: Id.nullable(),
  motivo: z.string(),
  /** Quando libera sozinha; `null` = só com ação da pessoa (ou na virada do dia/mês). */
  ate: Instante.nullable(),
  /** "Liberar agora" na tela zera o pico e a contagem de stops. */
  liberavel: z.boolean(),
});
export type PausaConta = z.infer<typeof PausaContaEsquema>;

/** O estado de uma rede (uma conta da corretora) contra os limites. */
export const SituacaoRedeEsquema = z.object({
  rede: Rede,
  robos: z.number().int().nonnegative(),
  realizadoDoDia: TextoDecimal,
  naoRealizado: TextoDecimal,
  /** O que conta contra o limite do dia (com ou sem o não realizado, conforme configurado). */
  perdaDoDia: TextoDecimal,
  exposicao: TextoDecimal,
  posicoesAbertas: z.number().int().nonnegative(),
  queda: TextoDecimal,
  pico: TextoDecimal,
  saidasComPerda: z.number().int().nonnegative(),
});
export type SituacaoRede = z.infer<typeof SituacaoRedeEsquema>;

export const OrcamentoIaEsquema = z.object({
  gastoMes: TextoDecimal,
  gastoDia: TextoDecimal,
  limiteMensal: TextoDecimal.nullable(),
  limiteDiario: TextoDecimal.nullable(),
  /** O maior uso entre o mês e o dia, de 0 a 1 (pode passar de 1). `null` sem limite. */
  uso: z.number().nonnegative().nullable(),
  esgotado: z.boolean(),
});
export type OrcamentoIa = z.infer<typeof OrcamentoIaEsquema>;

/** `GET /risco/conta`: limites, estado de cada rede, pausas em vigor e orçamento de IA. */
export const SituacaoContaEsquema = z.object({
  limites: LimitesContaEsquema,
  liberadaEm: Instante.nullable(),
  redes: z.array(SituacaoRedeEsquema),
  pausas: z.array(PausaContaEsquema),
  orcamentoIa: OrcamentoIaEsquema,
  em: Instante,
});
export type SituacaoConta = z.infer<typeof SituacaoContaEsquema>;

export const EstadoDivergencia = z.enum(["aberta", "aceita", "resolvida"]);
export type EstadoDivergencia = z.infer<typeof EstadoDivergencia>;

/** `GET /risco/divergencias`: saldo da corretora abaixo do que os robôs registram. */
export const DivergenciaEsquema = z.object({
  id: Id,
  rede: z.enum(["testnet", "real"]),
  ativo: z.string(),
  esperado: TextoDecimal,
  naCorretora: TextoDecimal,
  falta: TextoDecimal,
  estado: EstadoDivergencia,
  detectadaEm: Instante,
  atualizadaEm: Instante,
  resolvidaEm: Instante.nullable(),
  /** "conferencia" (o saldo voltou sozinho) ou o e-mail de quem aceitou. */
  resolvidaPor: z.string().nullable(),
  robos: z.array(z.object({ id: Id, nome: z.string() })),
});
export type DivergenciaDTO = z.infer<typeof DivergenciaEsquema>;

/** `POST /risco/reconciliar`: o que a conferência sob demanda encontrou. */
export const ResultadoReconciliacaoEsquema = z.object({
  em: Instante,
  conferidas: z.array(
    z.object({
      rede: z.enum(["testnet", "real"]),
      ok: z.boolean(),
      erro: z.string().nullable(),
      ativos: z.number().int().nonnegative(),
      divergentes: z.number().int().nonnegative(),
    }),
  ),
});
export type ResultadoReconciliacao = z.infer<typeof ResultadoReconciliacaoEsquema>;
