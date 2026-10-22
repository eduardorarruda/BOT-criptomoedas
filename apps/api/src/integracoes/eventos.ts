import { EventoEsquema, type Evento } from "@zentrade/contratos";
import type { Log } from "./tipos.js";

export interface Donos {
  donoDoRobo(roboId: string): Promise<string | null>;
  donoDaDecisao(decisaoId: string): Promise<string | null>;
}

type Enviar = (texto: string) => void;

export interface HubEventos {
  /** Conecta um cliente da pessoa; devolve a função que desconecta. */
  registrar(usuarioId: string, enviar: Enviar): () => void;
  /** Ouvintes internos (ex.: retransmissão ao n8n) recebem todo evento válido. */
  aoEvento(ouvinte: (evento: Evento) => Promise<void> | void): void;
  receber(mensagem: string): Promise<void>;
  conectados(): number;
}

const LIMITE_CACHE = 10_000;

/**
 * Retransmite o canal zentrade:eventos para os WebSockets. O evento do motor não diz
 * de quem é, então a dona é descoberta pelo robô (ou pela decisão) e só ela recebe.
 * Preço e saúde são públicos para quem está autenticado.
 */
export function criarHubEventos(o: { donos: Donos; log: Log }): HubEventos {
  const clientes = new Map<Enviar, string>();
  const ouvintes: ((evento: Evento) => Promise<void> | void)[] = [];
  const cache = new Map<string, string>();

  async function lembrar(chave: string, buscar: () => Promise<string | null>): Promise<string | null> {
    const guardado = cache.get(chave);
    if (guardado) return guardado;
    const dono = await buscar();
    if (dono) {
      if (cache.size >= LIMITE_CACHE) cache.clear();
      cache.set(chave, dono);
    }
    return dono;
  }

  function donoDe(e: Evento): Promise<string | null> | "todos" {
    switch (e.tipo) {
      case "preco":
      case "saude":
        return "todos";
      case "risco":
      case "analise":
      case "candle":
      case "sinal":
      case "posicao":
      case "pensamento":
        return lembrar(`r:${e.roboId}`, () => o.donos.donoDoRobo(e.roboId));
      case "robo":
        return lembrar(`r:${e.robo.id}`, () => o.donos.donoDoRobo(e.robo.id));
      case "decisao":
        return lembrar(`r:${e.decisao.roboId}`, () => o.donos.donoDoRobo(e.decisao.roboId));
      case "ordem":
        return lembrar(`d:${e.ordem.decisaoId}`, () => o.donos.donoDaDecisao(e.ordem.decisaoId));
      case "alerta": {
        const { usuarioId, roboId } = e.alerta;
        if (usuarioId) return Promise.resolve(usuarioId);
        return roboId ? lembrar(`r:${roboId}`, () => o.donos.donoDoRobo(roboId)) : Promise.resolve(null);
      }
    }
  }

  async function entregar(evento: Evento): Promise<void> {
    const dono = await donoDe(evento);
    const texto = JSON.stringify(evento);
    for (const [enviar, usuarioId] of clientes) {
      if (dono === "todos" || dono === usuarioId) enviar(texto);
    }
  }

  function ler(mensagem: string): Evento | null {
    let bruto: unknown;
    try {
      bruto = JSON.parse(mensagem);
    } catch {
      o.log.warn({ tamanho: mensagem.length }, "evento descartado: JSON inválido no canal de eventos");
      return null;
    }
    const lido = EventoEsquema.safeParse(bruto);
    if (!lido.success) {
      o.log.warn(
        { problemas: lido.error.issues.length },
        "evento descartado: fora do contrato EventoEsquema",
      );
      return null;
    }
    return lido.data;
  }

  return {
    registrar(usuarioId, enviar) {
      clientes.set(enviar, usuarioId);
      return () => clientes.delete(enviar);
    },
    aoEvento: (ouvinte) => ouvintes.push(ouvinte),
    async receber(mensagem) {
      const evento = ler(mensagem);
      if (!evento) return;
      try {
        await Promise.all([entregar(evento), ...ouvintes.map((f) => f(evento))]);
      } catch (erro) {
        o.log.error({ err: erro, tipo: evento.tipo }, "falha ao retransmitir evento");
      }
    },
    conectados: () => clientes.size,
  };
}
