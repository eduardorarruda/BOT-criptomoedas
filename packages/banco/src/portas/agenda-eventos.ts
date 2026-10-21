import type { PortaAgendaEventos } from "@zentrade/contratos";
import type { EventoMercado } from "@zentrade/dominio";
import { eq } from "drizzle-orm";
import { comoUsuario, type Db } from "../cliente.js";
import { ErroDados } from "../erros.js";
import { eventosMercado, robos } from "../esquema/index.js";

/**
 * A agenda de eventos para o filtro de dia de evento (motor). Acha a dona do robô
 * (acesso de sistema, só o id) e lê a agenda como ela, sob RLS: um bug aqui não mistura
 * a agenda de outra pessoa.
 */
export function portaAgendaEventos(db: Db): PortaAgendaEventos {
  return {
    async doDia(roboId: string, dia: string): Promise<EventoMercado[]> {
      const [robo] = await db.select({ usuarioId: robos.usuarioId }).from(robos).where(eq(robos.id, roboId));
      if (!robo) throw new ErroDados("nao_encontrado", `o robô ${roboId} não existe`);
      return comoUsuario(db, robo.usuarioId, async (tx) =>
        (await tx.select().from(eventosMercado).where(eq(eventosMercado.data, dia))).map((l) => ({
          data: l.data,
          mercado: l.mercado,
          titulo: l.titulo,
          impacto: l.impacto,
          de: l.de,
          ate: l.ate,
        })),
      );
    },
  };
}
