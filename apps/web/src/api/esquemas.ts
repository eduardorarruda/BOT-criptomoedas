import { EventoEsquema, Instante } from "@zentrade/contratos/esquemas";
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

export type { EventoAnalise } from "@zentrade/contratos/esquemas";

/**
 * Histórico curto do que os robôs fizeram (GET /aovivo/.../recentes). Proposta de
 * contrato: por enquanto só a API e a tela conhecem este formato.
 */
export const RegistroAoVivoEsquema = z.object({ recebidoEm: Instante, evento: EventoEsquema });
export type RegistroAoVivo = z.infer<typeof RegistroAoVivoEsquema>;
export const RespostaAoVivoEsquema = z.object({ eventos: z.array(RegistroAoVivoEsquema) });
