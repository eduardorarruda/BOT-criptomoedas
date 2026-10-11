import {
  PropostaAgenteEsquema,
  TextoDecimal,
  type PedidoAnalise,
  type PortaAgente,
  type RespostaAnalise,
} from "@zentrade/contratos";
import { dec, paraTexto, type Posicao, type Sinal } from "@zentrade/dominio";
import { z } from "zod";
import { USUARIO_LOCAL } from "../usuario-local.js";

export interface OpcoesAgenteHttp {
  readonly url: string;
  readonly segredo: string;
  readonly timeoutMs?: number;
  readonly fetch?: typeof fetch;
}

const Resposta = z.object({ proposta: PropostaAgenteEsquema, custoUsd: TextoDecimal });

function sinalNoFio(s: Sinal) {
  return s.acao === "COMPRAR" ? { ...s, stop: paraTexto(s.stop), alvo: paraTexto(s.alvo) } : { ...s };
}

const posicaoNoFio = (p: Posicao) => ({
  quantidade: paraTexto(p.quantidade),
  precoMedio: paraTexto(p.precoMedio),
  resultadoRealizado: paraTexto(p.resultadoRealizado),
  taxasPagas: paraTexto(p.taxasPagas),
});

/**
 * O corpo do POST /analisar no formato que o apps/agente valida (serializacao.ts de
 * lá): decimais sempre em texto plano (nunca "1e-7"), `usuarioId` e `orcamento`
 * opcionais. A dona local (arquivo, backtest) não vai: o agente usa a configurada nele.
 */
export function pedidoNoFio(p: PedidoAnalise) {
  const o = p.orcamento;
  return {
    robo: { ...p.robo },
    sinal: sinalNoFio(p.sinal),
    preco: paraTexto(p.preco),
    fechamentos: [...p.fechamentos],
    posicao: posicaoNoFio(p.posicao),
    ...(p.usuarioId && p.usuarioId !== USUARIO_LOCAL ? { usuarioId: p.usuarioId } : {}),
    ...(o
      ? {
          orcamento: {
            riscoPorOperacao: paraTexto(o.riscoPorOperacao),
            exposicaoMaxima: paraTexto(o.exposicaoMaxima),
            perdaDiariaMaxima: paraTexto(o.perdaDiariaMaxima),
            exposicaoAtual: paraTexto(o.exposicaoAtual),
            resultadoDoDia: paraTexto(o.resultadoDoDia),
          },
        }
      : {}),
  };
}

/**
 * Cliente do apps/agente (POST /analisar). Decimais vão em texto (pedidoNoFio).
 * Qualquer falha vira erro: o motor decide, pela configuração, se isso barra a operação.
 */
export class AgenteHttp implements PortaAgente {
  private readonly fetch: typeof fetch;

  constructor(private readonly o: OpcoesAgenteHttp) {
    this.fetch = o.fetch ?? globalThis.fetch;
  }

  async analisar(pedido: PedidoAnalise): Promise<RespostaAnalise> {
    const resposta = await this.enviar(pedido);
    if (!resposta.ok)
      throw new Error(`O agente respondeu HTTP ${resposta.status}. Veja os registros do apps/agente.`);
    const corpo = Resposta.safeParse(await resposta.json().catch(() => null));
    if (!corpo.success)
      throw new Error(
        `A resposta do agente veio num formato inválido (${corpo.error.issues[0]?.message ?? "?"}).`,
      );
    return { proposta: corpo.data.proposta, custoUsd: dec(corpo.data.custoUsd) };
  }

  private async enviar(pedido: PedidoAnalise): Promise<Response> {
    try {
      return await this.fetch(`${this.o.url}/analisar`, {
        method: "POST",
        headers: { "content-type": "application/json", Authorization: `Bearer ${this.o.segredo}` },
        body: JSON.stringify(pedidoNoFio(pedido)),
        signal: AbortSignal.timeout(this.o.timeoutMs ?? 60_000),
      });
    } catch (erro) {
      const detalhe = erro instanceof Error ? erro.message : String(erro);
      throw new Error(
        `O agente não respondeu (${detalhe}). Confira se o apps/agente está no ar em ${this.o.url}.`,
        { cause: erro },
      );
    }
  }
}
