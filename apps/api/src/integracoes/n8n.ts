import {
  assinar,
  CABECALHO_ASSINATURA,
  PropostaCriadaEsquema,
  type PropostaCriada,
} from "@zentrade/contratos";
import { z } from "zod";
import type { Buscar } from "./tipos.js";

export const AlertaEsquema = z.object({
  tipo: z.string().min(1).max(40),
  titulo: z.string().min(1).max(120),
  mensagem: z.string().min(1).max(1000),
  em: z.number().int().nonnegative(),
});
export type Alerta = z.infer<typeof AlertaEsquema>;

export interface ClienteN8n {
  enviarProposta(p: PropostaCriada): Promise<void>;
  enviarAlerta(a: Alerta): Promise<void>;
}

export interface OpcoesN8n {
  readonly url: string;
  readonly segredo: string;
  readonly buscar?: Buscar;
  readonly agora?: () => number;
  readonly limiteMs?: number;
}

/** API → n8n, sempre assinado (o mesmo HMAC que a API confere nos webhooks que recebe). */
export function criarClienteN8n(o: OpcoesN8n): ClienteN8n {
  const buscar = o.buscar ?? fetch;
  const agora = o.agora ?? Date.now;
  const base = o.url.replace(/\/+$/, "");

  async function enviar(caminho: string, corpo: string, oQue: string): Promise<void> {
    const resposta = await buscar(`${base}/webhook/${caminho}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [CABECALHO_ASSINATURA]: assinar(corpo, o.segredo, agora()),
      },
      body: corpo,
      signal: AbortSignal.timeout(o.limiteMs ?? 10_000),
    });
    if (!resposta.ok) {
      throw new Error(`o n8n respondeu ${resposta.status} ao receber ${oQue}; confira o workflow ${caminho}`);
    }
  }

  return {
    enviarProposta: async (p) =>
      enviar("zentrade-proposta", JSON.stringify(PropostaCriadaEsquema.parse(p)), "a proposta"),
    enviarAlerta: async (a) => enviar("zentrade-alerta", JSON.stringify(AlertaEsquema.parse(a)), "o alerta"),
  };
}
