import type { Condicao } from "@zentrade/dominio";
import { z } from "zod";
import { Id, Instante, Intervalo, TextoDecimal } from "./comum.js";

/** Cenário de mercado com os números que o justificam (veja regime.ts no domínio). */
export const LeituraCenarioEsquema = z.object({
  cenario: z.enum(["alta", "queda", "lateral", "indefinido"]),
  precoVsSma200: z.number().nullable(),
  precoVsSma400: z.number().nullable(),
  inclinacaoSma200: z.number().nullable(),
  limiarInclinacao: z.number().nullable(),
  variacao7d: z.number().nullable(),
  janelaVariacaoHoras: z.number().nullable(),
  atrPct: z.number().nullable(),
  atrPercentil: z.number().nullable(),
  eficiencia: z.number().nullable(),
  texto: z.string(),
});
export type LeituraCenarioDTO = z.infer<typeof LeituraCenarioEsquema>;

/** Uma condição da regra (folha) ou um grupo E / OU / NÃO, com o texto e os valores do momento. */
export const CondicaoEsquema: z.ZodType<Condicao> = z.lazy(() =>
  z.object({
    tipo: z.enum(["condicao", "e", "ou", "nao"]),
    valor: z.boolean(),
    texto: z.string(),
    filhos: z.array(CondicaoEsquema).optional(),
  }),
);

export const PensamentoEsquema = z.object({
  em: Instante,
  preco: TextoDecimal,
  sinal: z.enum(["COMPRAR", "VENDER", "AGUARDAR"]),
  motivoSaida: z.enum(["stop", "alvo", "regra de saída", "tempo"]).optional(),
  posicionado: z.boolean(),
  regraAvaliada: z.enum(["entrada", "saida", "nenhuma"]),
  condicoes: CondicaoEsquema.nullable(),
  cenario: LeituraCenarioEsquema,
  agente: z.enum(["decide", "desligado"]),
  explicacao: z.string(),
  conclusao: z.string(),
});
export type PensamentoDTO = z.infer<typeof PensamentoEsquema>;

/** A última leitura de um robô, com o que a tela precisa para nomear o robô. */
export const PensamentoAtualEsquema = z.object({
  roboId: Id,
  simbolo: z.string(),
  intervalo: Intervalo,
  pensamento: PensamentoEsquema,
});
export type PensamentoAtualDTO = z.infer<typeof PensamentoAtualEsquema>;

/** Por que uma leitura entrou no histórico curto. */
export const MotivoHistorico = z.enum(["inicio", "cenario", "sinal"]);
export type MotivoHistorico = z.infer<typeof MotivoHistorico>;

export const PensamentoHistoricoEsquema = z.object({
  motivo: MotivoHistorico,
  pensamento: PensamentoEsquema,
});
export type PensamentoHistoricoDTO = z.infer<typeof PensamentoHistoricoEsquema>;

/** O cenário de um ativo num intervalo, lido do robô mais recente que o vigia. */
export const CenarioDoAtivoEsquema = z.object({
  simbolo: z.string(),
  intervalo: Intervalo,
  roboIds: z.array(Id),
  em: Instante,
  preco: TextoDecimal,
  cenario: LeituraCenarioEsquema,
});
export type CenarioDoAtivoDTO = z.infer<typeof CenarioDoAtivoEsquema>;

/** Quantas leituras o histórico curto guarda por robô. */
export const LIMITE_HISTORICO_PENSAMENTO = 200;
