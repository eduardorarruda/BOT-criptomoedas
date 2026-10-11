import { Id, Instante } from "@zentrade/contratos/esquemas";
import { z } from "zod";

/**
 * Os formatos da API vêm de @zentrade/contratos (subcaminho sem código de servidor).
 * Aqui fica só o que ainda é proposta da tela e não entrou no contrato.
 */
export {
  AutomacaoEsquema,
  BacktestEsquema,
  CandleApiEsquema,
  ContaCorretoraEsquema,
  DocumentoEsquema,
  DocumentoIngeridoEsquema,
  ErroRespostaEsquema,
  EscopoToken,
  FonteDocumento,
  ParadaTotalEsquema,
  PontoPatrimonioEsquema,
  ResumoEsquema,
  SaudeEsquema,
  SessaoEsquema,
  TokenApiEsquema,
  TokenCriadoEsquema,
  UsuarioEsquema,
} from "@zentrade/contratos/esquemas";
export type {
  Automacao,
  BacktestDTO as Backtest,
  CandleApi,
  ContaCorretora,
  Documento,
  DocumentoIngerido,
  MetricasBacktest,
  PontoCurvaBacktest,
  PontoPatrimonio,
  Resumo,
  Saude,
  TokenApi,
  TokenCriado,
  Usuario,
} from "@zentrade/contratos/esquemas";

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
