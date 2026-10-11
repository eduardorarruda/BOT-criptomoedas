import { CANAL_EVENTOS } from "@zentrade/contratos";
import { Redis } from "ioredis";
import type { VerificadorSaude } from "../dependencias.js";
import type { HubEventos } from "./eventos.js";
import type { Buscar, Log } from "./tipos.js";

/** Chave onde o motor grava, em ms, a última vez que esteve vivo. */
export const CHAVE_BATIDA_MOTOR = "zentrade:motor:batida";

export const conectarRedis = (url: string, nome: string): Redis =>
  new Redis(url, { connectionName: nome, maxRetriesPerRequest: null });

/** Assina o canal de eventos do motor e entrega cada mensagem ao hub. */
export async function assinarEventos(assinante: Redis, hub: HubEventos): Promise<void> {
  assinante.on("message", (canal: string, mensagem: string) => {
    if (canal === CANAL_EVENTOS) void hub.receber(mensagem);
  });
  await assinante.subscribe(CANAL_EVENTOS);
}

export function verificadorSaude(o: {
  redis: Redis;
  log: Log;
  agora: () => number;
  agenteUrl?: string;
  buscar?: Buscar;
}): VerificadorSaude {
  const buscar = o.buscar ?? fetch;
  return {
    async redis() {
      try {
        return (await o.redis.ping()) === "PONG";
      } catch (erro) {
        o.log.error({ err: erro }, "Redis não respondeu à checagem de saúde");
        return false;
      }
    },
    async motorVivoHaSegundos() {
      const valor = Number(await o.redis.get(CHAVE_BATIDA_MOTOR));
      return Number.isFinite(valor) && valor > 0 ? Math.max(0, Math.floor((o.agora() - valor) / 1000)) : null;
    },
    async agente() {
      if (!o.agenteUrl) return null;
      try {
        const r = await buscar(`${o.agenteUrl.replace(/\/+$/, "")}/saude`, {
          signal: AbortSignal.timeout(2000),
        });
        return r.ok;
      } catch (erro) {
        o.log.warn({ err: erro }, "agente não respondeu à checagem de saúde");
        return false;
      }
    },
  };
}
