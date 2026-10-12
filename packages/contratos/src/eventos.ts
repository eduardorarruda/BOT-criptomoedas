import { z } from "zod";
import { AlertaEmitidoEsquema } from "./alertas.js";
import { BarreiraEsquema, DecisaoEsquema, OrdemEsquema, RoboEsquema } from "./dados.js";
import { Id, Instante, TextoDecimal } from "./comum.js";

/** Candle fechado de um robô, para o gráfico ao vivo (decimais em texto). */
export const CandleEventoEsquema = z.object({
  abertura: Instante,
  abre: TextoDecimal,
  maxima: TextoDecimal,
  minima: TextoDecimal,
  fecha: TextoDecimal,
  volume: TextoDecimal,
});

/**
 * Passo a passo do agente enquanto analisa: o motor cria o `analiseId`, manda no
 * pedido ao agente, e o agente publica cada ferramenta consultada; `concluida` fecha.
 */
export const EventoAnaliseEsquema = z.object({
  tipo: z.literal("analise"),
  analiseId: Id,
  roboId: Id,
  etapa: z.object({ ferramenta: z.string(), descricao: z.string(), em: Instante }).optional(),
  concluida: z.boolean(),
  /** Quando concluída: a ação proposta, ou a falha que fez o motor não operar. */
  resultado: z.enum(["comprar", "vender", "aguardar", "falhou"]).optional(),
  decisaoId: Id.optional(),
});
export type EventoAnalise = z.infer<typeof EventoAnaliseEsquema>;

/** Eventos ao vivo: motor e agente → Redis → API → WebSocket da tela. */
export const EventoEsquema = z.discriminatedUnion("tipo", [
  EventoAnaliseEsquema,
  z.object({
    tipo: z.literal("candle"),
    roboId: Id,
    simbolo: z.string(),
    intervalo: z.string(),
    candle: CandleEventoEsquema,
  }),
  z.object({
    tipo: z.literal("sinal"),
    roboId: Id,
    acao: z.enum(["COMPRAR", "VENDER", "AGUARDAR"]),
    explicacao: z.string(),
    preco: TextoDecimal,
    em: Instante,
  }),
  z.object({
    tipo: z.literal("posicao"),
    roboId: Id,
    simbolo: z.string(),
    quantidade: TextoDecimal,
    precoMedio: TextoDecimal,
    resultadoRealizado: TextoDecimal,
    taxasPagas: TextoDecimal,
    em: Instante,
  }),
  z.object({ tipo: z.literal("preco"), simbolo: z.string(), preco: TextoDecimal, em: Instante }),
  z.object({ tipo: z.literal("decisao"), decisao: DecisaoEsquema }),
  z.object({ tipo: z.literal("ordem"), ordem: OrdemEsquema }),
  z.object({ tipo: z.literal("risco"), roboId: Id, barreira: BarreiraEsquema, em: Instante }),
  z.object({ tipo: z.literal("robo"), robo: RoboEsquema }),
  z.object({
    tipo: z.literal("saude"),
    servico: z.enum(["motor", "agente", "api"]),
    ok: z.boolean(),
    em: Instante,
  }),
  /** Alerta operacional (robô que não liga, WebSocket fora, orçamento de IA...): a API trata. */
  z.object({ tipo: z.literal("alerta"), alerta: AlertaEmitidoEsquema }),
]);
export type Evento = z.infer<typeof EventoEsquema>;

export const CANAL_EVENTOS = "zentrade:eventos";
