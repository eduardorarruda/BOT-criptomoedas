import { CANAL_EVENTOS, EventoAnaliseEsquema, type EventoAnalise } from "@zentrade/contratos";
import type { AoUsarFerramenta } from "../ferramentas/index.js";
import { descreverEtapa } from "./descrever.js";

/** Para onde vão os eventos "analise" (Redis em produção; memória nos testes). */
export interface PublicadorEventos {
  publicar(evento: EventoAnalise): Promise<void>;
}

/** O mínimo do cliente Redis que o publicador usa (o ioredis serve). */
export interface RedisPublicador {
  publish(canal: string, mensagem: string): Promise<number>;
}

export interface LogEventos {
  warn(obj: object, msg?: string): void;
}

/**
 * Publica em `zentrade:eventos`, no formato EventoAnaliseEsquema. Falha ao publicar
 * nunca derruba a análise: o passo a passo é enfeite, a proposta é o que importa.
 */
export function publicadorRedis(redis: RedisPublicador, log: LogEventos): PublicadorEventos {
  return {
    async publicar(evento) {
      try {
        await redis.publish(CANAL_EVENTOS, JSON.stringify(EventoAnaliseEsquema.parse(evento)));
      } catch (erro) {
        log.warn({ err: erro, analiseId: evento.analiseId }, "não deu para publicar o passo da análise");
      }
    },
  };
}

/** Sem Redis configurado: os passos simplesmente não são publicados. */
export const publicadorNulo: PublicadorEventos = { publicar: async () => undefined };

/**
 * Observador das ferramentas de uma análise: cada ferramenta consultada vira um evento
 * "analise" com a etapa (ferramenta + descrição curta). Sem `analiseId` no pedido, não
 * há a quem ligar os passos e nada é publicado. A conclusão é do motor (tem o decisaoId).
 */
export function observadorDaAnalise(o: {
  readonly analiseId: string | undefined;
  readonly roboId: string;
  readonly publicador: PublicadorEventos;
  readonly agora?: () => number;
}): AoUsarFerramenta | undefined {
  const { analiseId } = o;
  if (!analiseId) return undefined;
  const agora = o.agora ?? Date.now;
  return (nome, entrada) => {
    void o.publicador.publicar({
      tipo: "analise",
      analiseId,
      roboId: o.roboId,
      etapa: { ferramenta: nome, descricao: descreverEtapa(nome, entrada), em: agora() },
      concluida: false,
    });
  };
}
