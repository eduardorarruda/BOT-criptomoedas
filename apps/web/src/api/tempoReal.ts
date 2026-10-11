import { EventoEsquema } from "@zentrade/contratos";
import { EventoAnaliseEsquema } from "./esquemas";
import type { EventoTela, OuvintesTempoReal } from "./fonte";

/**
 * WebSocket `/api/v1/tempo-real`. Reconecta sozinho com espera crescente (1 s, 2 s,
 * 4 s… até 30 s). Mensagem que não passa no esquema é ignorada: um evento estranho
 * não pode derrubar a tela.
 */
const ESPERA_INICIAL_MS = 1000;
const ESPERA_MAXIMA_MS = 30_000;

export function interpretarEvento(dados: string): EventoTela | null {
  let bruto: unknown;
  try {
    bruto = JSON.parse(dados);
  } catch {
    return null;
  }
  const evento = EventoEsquema.safeParse(bruto);
  if (evento.success) return evento.data;
  const analise = EventoAnaliseEsquema.safeParse(bruto);
  return analise.success ? analise.data : null;
}

export function urlTempoReal(local: Pick<Location, "protocol" | "host"> = window.location): string {
  const protocolo = local.protocol === "https:" ? "wss:" : "ws:";
  return `${protocolo}//${local.host}/api/v1/tempo-real`;
}

export interface OpcoesTempoReal extends OuvintesTempoReal {
  readonly url?: string;
  readonly criarSocket?: (url: string) => WebSocket;
  readonly agendar?: (f: () => void, ms: number) => ReturnType<typeof setTimeout>;
}

export const proximaEspera = (tentativa: number): number =>
  Math.min(ESPERA_MAXIMA_MS, ESPERA_INICIAL_MS * 2 ** tentativa);

export function conectarTempoReal(o: OpcoesTempoReal): () => void {
  const url = o.url ?? urlTempoReal();
  const criar = o.criarSocket ?? ((u: string) => new WebSocket(u));
  const agendar = o.agendar ?? ((f: () => void, ms: number) => setTimeout(f, ms));
  let tentativa = 0;
  let encerrado = false;
  let socket: WebSocket | null = null;
  let espera: ReturnType<typeof setTimeout> | null = null;

  const abrir = (): void => {
    o.aoEstado(tentativa === 0 ? "conectando" : "reconectando");
    socket = criar(url);
    socket.onopen = () => {
      tentativa = 0;
      o.aoEstado("conectado");
    };
    socket.onmessage = (m: MessageEvent) => {
      const evento = typeof m.data === "string" ? interpretarEvento(m.data) : null;
      if (evento) o.aoEvento(evento);
    };
    socket.onclose = () => {
      if (encerrado) return;
      o.aoEstado("reconectando");
      espera = agendar(abrir, proximaEspera(tentativa));
      tentativa++;
    };
  };

  abrir();
  return () => {
    encerrado = true;
    if (espera !== null) clearTimeout(espera);
    socket?.close();
    o.aoEstado("desligado");
  };
}
