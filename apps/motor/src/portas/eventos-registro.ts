import type { Evento, PortaEventos } from "@zentrade/contratos";
import type { Registro } from "../nucleo/tipos.js";

/** Eventos no log enquanto não há Redis (o canal zentrade:eventos chega com a integração). */
export class EventosNoRegistro implements PortaEventos {
  constructor(private readonly registro: Registro) {}

  publicar(evento: Evento): Promise<void> {
    this.registro.info({ evento }, `evento ${evento.tipo}`);
    return Promise.resolve();
  }
}
