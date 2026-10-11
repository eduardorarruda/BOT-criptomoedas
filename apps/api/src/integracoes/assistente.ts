import {
  ErroRespostaEsquema,
  EstadoAgenteAssistenteEsquema,
  EventoRespostaAgenteEsquema,
  LIMITE_RESPOSTA,
  type EstadoAgenteAssistente,
  type EventoRespostaAgente,
  type FerramentaUsada,
  type FonteCitada,
  type PedidoRespostaAgente,
  type ProvedorIa,
} from "@zentrade/contratos";
import { z } from "zod";
import type { Buscar } from "./tipos.js";

/**
 * O assistente visto pela API: fala com o agente na rede interna (o agente não fica
 * exposto). A API autentica a pessoa e manda só o usuarioId dela.
 */
export interface ClienteAssistente {
  /** `null` = o agente não respondeu (fora do ar ou segredo errado). */
  estado(): Promise<EstadoAgenteAssistente | null>;
  responder(pedido: PedidoRespostaAgente, sinal: AbortSignal): AsyncIterable<EventoRespostaAgente>;
}

export class ErroAgenteAssistente extends Error {
  override name = "ErroAgenteAssistente";
}

const AmbienteAssistente = z.object({
  AGENTE_URL: z.url().optional(),
  AGENTE_SEGREDO: z.string().min(32, "AGENTE_SEGREDO precisa ter pelo menos 32 caracteres").optional(),
});

/** Sem AGENTE_URL ou AGENTE_SEGREDO, o assistente fica desligado (as rotas respondem 503). */
export function configAssistenteDoAmbiente(
  env: Readonly<Record<string, string | undefined>>,
): { readonly url: string; readonly segredo: string } | null {
  const lido = AmbienteAssistente.safeParse(env);
  if (!lido.success) throw new Error(`configuração do assistente inválida: ${z.prettifyError(lido.error)}`);
  const { AGENTE_URL: url, AGENTE_SEGREDO: segredo } = lido.data;
  return url && segredo ? { url: url.replace(/\/+$/, ""), segredo } : null;
}

async function* linhasNdjson(corpo: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const decodificador = new TextDecoder();
  let resto = "";
  for await (const pedaco of corpo) {
    resto += decodificador.decode(pedaco, { stream: true });
    const partes = resto.split("\n");
    resto = partes.pop() ?? "";
    yield* partes.filter((l) => l.trim() !== "");
  }
  if (resto.trim() !== "") yield resto;
}

function jsonOuNulo(linha: string): unknown {
  try {
    return JSON.parse(linha);
  } catch {
    return null;
  }
}

async function erroDoAgente(r: Response): Promise<ErroAgenteAssistente> {
  const corpo = ErroRespostaEsquema.safeParse(await r.json().catch(() => null));
  return new ErroAgenteAssistente(
    corpo.success ? corpo.data.erro.mensagem : `o agente respondeu ${r.status}; veja o log do serviço agente`,
  );
}

export function criarClienteAssistente(o: {
  url: string;
  segredo: string;
  buscar?: Buscar;
}): ClienteAssistente {
  const buscar = o.buscar ?? fetch;
  const cabecalhos = { authorization: `Bearer ${o.segredo}`, "content-type": "application/json" };
  return {
    async estado() {
      try {
        const r = await buscar(`${o.url}/assistente/estado`, {
          headers: cabecalhos,
          signal: AbortSignal.timeout(5_000),
        });
        if (!r.ok) return null;
        const lido = EstadoAgenteAssistenteEsquema.safeParse(await r.json());
        return lido.success ? lido.data : null;
      } catch {
        return null;
      }
    },
    async *responder(pedido, sinal) {
      const r = await buscar(`${o.url}/assistente/responder`, {
        method: "POST",
        headers: cabecalhos,
        body: JSON.stringify(pedido),
        signal: sinal,
      });
      if (!r.ok || !r.body) throw await erroDoAgente(r);
      for await (const linha of linhasNdjson(r.body)) {
        const lido = EventoRespostaAgenteEsquema.safeParse(jsonOuNulo(linha));
        if (lido.success) yield lido.data;
      }
    },
  };
}

/** A resposta do assistente montada a partir dos eventos, pronta para gravar. */
export interface RespostaMontada {
  readonly texto: string;
  readonly fontes: FonteCitada[];
  readonly ferramentas: FerramentaUsada[];
  readonly situacao: "ok" | "erro" | "interrompida";
  readonly erro: string | null;
  readonly provedor: ProvedorIa | null;
  readonly modelo: string | null;
}

const MAXIMO_LISTA = 50;

/** Junta os eventos do agente; sem "concluido", a resposta não terminou bem. */
export function montarResposta() {
  let texto = "";
  let fontes: FonteCitada[] = [];
  const ferramentas: FerramentaUsada[] = [];
  let fim: Pick<RespostaMontada, "situacao" | "erro" | "provedor" | "modelo"> | null = null;
  return {
    aplicar(e: EventoRespostaAgente): void {
      if (e.tipo === "texto") texto = (texto + e.delta).slice(0, LIMITE_RESPOSTA);
      else if (e.tipo === "ferramenta" && ferramentas.length < MAXIMO_LISTA)
        ferramentas.push({ nome: e.nome, descricao: e.descricao });
      else if (e.tipo === "fontes") fontes = e.fontes.slice(0, MAXIMO_LISTA);
      else if (e.tipo === "erro") fim = { situacao: "erro", erro: e.mensagem, provedor: null, modelo: null };
      else if (e.tipo === "concluido")
        fim = { situacao: "ok", erro: null, provedor: e.provedor, modelo: e.modelo };
    },
    falhar(situacao: "erro" | "interrompida", erro: string): void {
      fim ??= { situacao, erro, provedor: null, modelo: null };
    },
    resultado(): RespostaMontada {
      const final = fim ?? {
        situacao: "erro" as const,
        erro: "A resposta terminou sem conclusão.",
        provedor: null,
        modelo: null,
      };
      return { texto, fontes, ferramentas, ...final };
    },
  };
}
