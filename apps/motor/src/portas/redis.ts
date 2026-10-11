import { CANAL_EVENTOS, type Evento, type PortaEventos } from "@zentrade/contratos";

/** Chave onde o motor grava, em ms, a última vez que esteve vivo (a API lê para o /saude). */
export const CHAVE_BATIDA_MOTOR = "zentrade:motor:batida";

/** Sem batida há uma hora, a chave some: um motor morto não parece vivo para sempre. */
const VALIDADE_BATIDA_S = 3600;

/** O pedaço do ioredis que o motor usa (facilita o teste sem Redis). */
export interface ClienteRedis {
  publish(canal: string, mensagem: string): Promise<number>;
  set(chave: string, valor: string, modo: "EX", segundos: number): Promise<unknown>;
}

/** Motor → Redis → API → WebSocket da tela. */
export class EventosRedis implements PortaEventos {
  constructor(private readonly redis: ClienteRedis) {}

  async publicar(evento: Evento): Promise<void> {
    await this.redis.publish(CANAL_EVENTOS, JSON.stringify(evento));
  }
}

export class BatidaRedis {
  constructor(private readonly redis: ClienteRedis) {}

  async bater(em: number): Promise<void> {
    await this.redis.set(CHAVE_BATIDA_MOTOR, String(em), "EX", VALIDADE_BATIDA_S);
  }
}
