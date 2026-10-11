import {
  AlertaEsquema,
  assinar,
  CABECALHO_ASSINATURA,
  PropostaCriadaEsquema,
  type Alerta,
  type PropostaCriada,
} from "@zentrade/contratos";
import type { RegistroAutomacoes } from "./automacoes.js";
import type { Buscar } from "./tipos.js";

export type { Alerta };

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

/** Anota cada envio ao n8n (deu certo ou não) no status das automações. */
export function n8nComRegistro(
  cliente: ClienteN8n,
  registro: Pick<RegistroAutomacoes, "registrar">,
): ClienteN8n {
  async function medir(fluxo: "zentrade-aprovacao" | "zentrade-alertas", enviar: () => Promise<void>) {
    try {
      await enviar();
    } catch (erro) {
      await registro.registrar(fluxo, false);
      throw erro;
    }
    await registro.registrar(fluxo, true);
  }
  return {
    enviarProposta: (p) => medir("zentrade-aprovacao", () => cliente.enviarProposta(p)),
    enviarAlerta: (a) => medir("zentrade-alertas", () => cliente.enviarAlerta(a)),
  };
}
