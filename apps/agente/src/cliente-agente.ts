import {
  PropostaAgenteEsquema,
  TextoDecimal,
  type PedidoAnalise,
  type PortaAgente,
  type RespostaAnalise,
  ErroRespostaEsquema,
} from "@zentrade/contratos";
import { dec } from "@zentrade/dominio";
import { z } from "zod";
import { pedidoParaJson } from "./serializacao.js";

export class ErroClienteAgente extends Error {
  override name = "ErroClienteAgente";
}

export interface OpcoesClienteAgente {
  /** Ex.: http://agente:8081 */
  readonly url: string;
  readonly segredo: string;
  readonly timeoutMs?: number;
  /** Dono da base de conhecimento consultada (extensão opcional do pedido). */
  readonly usuarioId?: string;
  readonly fetch?: (url: string, init: RequestInit) => Promise<Response>;
}

const RespostaJson = z.object({ proposta: PropostaAgenteEsquema, custoUsd: TextoDecimal });

async function lerErro(r: Response): Promise<string> {
  const corpo = ErroRespostaEsquema.safeParse(await r.json().catch(() => null));
  const detalhe = corpo.success ? `${corpo.data.erro.codigo}: ${corpo.data.erro.mensagem}` : "sem detalhe";
  const dica = r.status === 401 ? " Confira se AGENTE_SEGREDO é o mesmo no motor e no agente." : "";
  return `O agente respondeu ${r.status} (${detalhe}).${dica}`;
}

/** PortaAgente por HTTP, para o motor. Qualquer falha vira erro: o motor então não opera. */
export class ClienteAgente implements PortaAgente {
  readonly #o: OpcoesClienteAgente;

  constructor(opcoes: OpcoesClienteAgente) {
    if (opcoes.segredo.length < 32) {
      throw new ErroClienteAgente("AGENTE_SEGREDO precisa ter pelo menos 32 caracteres.");
    }
    this.#o = opcoes;
  }

  async analisar(pedido: PedidoAnalise): Promise<RespostaAnalise> {
    const buscar = this.#o.fetch ?? fetch;
    const corpo = {
      ...pedidoParaJson(pedido),
      ...(this.#o.usuarioId ? { usuarioId: this.#o.usuarioId } : {}),
    };
    const timeoutMs = this.#o.timeoutMs ?? 60_000;
    const r = await buscar(`${this.#o.url.replace(/\/+$/, "")}/analisar`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${this.#o.segredo}` },
      body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(timeoutMs),
    }).catch((e: unknown) => {
      const causa = e instanceof Error ? e.message : String(e);
      throw new ErroClienteAgente(`O agente não respondeu em ${timeoutMs} ms ou está fora do ar (${causa}).`);
    });
    if (!r.ok) throw new ErroClienteAgente(await lerErro(r));
    const lido = RespostaJson.safeParse(await r.json().catch(() => null));
    if (!lido.success) {
      throw new ErroClienteAgente(
        `Resposta do agente fora do formato { proposta, custoUsd }: ${lido.error.message}`,
      );
    }
    return { proposta: lido.data.proposta, custoUsd: dec(lido.data.custoUsd) };
  }
}
