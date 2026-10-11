import { z } from "zod";
import { BarreiraEsquema, DecisaoEsquema, OrdemEsquema, RoboEsquema } from "./dados.js";
import { Id, Instante, TextoDecimal } from "./comum.js";

/** Eventos ao vivo: motor → Redis → API → WebSocket da tela. */
export const EventoEsquema = z.discriminatedUnion("tipo", [
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
]);
export type Evento = z.infer<typeof EventoEsquema>;

export const CANAL_EVENTOS = "zentrade:eventos";
