import type Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { BetaMessage } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import {
  PropostaAgenteEsquema,
  type PedidoAnalise,
  type PropostaAgente,
  type RespostaAnalise,
} from "@zentrade/contratos";
import { custoUsd } from "./custo.js";
import { criarFerramentas, RegistroFontes, type DependenciasFerramentas } from "./ferramentas/index.js";
import { mensagemDoPedido, SYSTEM_PROMPT } from "./prompt.js";
import type { OrcamentoRisco } from "./serializacao.js";

export const MODELO_PADRAO = "claude-opus-5";
const BETA_FALLBACK = "server-side-fallback-2026-07-01";
const FORMATO_PROPOSTA = betaZodOutputFormat(PropostaAgenteEsquema);

export class ErroPropostaInvalida extends Error {
  override name = "ErroPropostaInvalida";
}

export interface OpcoesAnalista {
  readonly cliente: Anthropic;
  readonly dependencias: DependenciasFerramentas;
  readonly modelo?: string;
  readonly maxTokens?: number;
  /** Teto de chamadas à API numa análise (cada volta do laço de ferramentas é uma). */
  readonly maxIteracoes?: number;
  readonly agora?: () => Date;
}

export interface OpcoesAnalise {
  readonly usuarioId: string;
  readonly orcamento?: OrcamentoRisco;
  readonly signal?: AbortSignal;
}

const LIMITE_JUSTIFICATIVA = 2000;

/** Proposta conservadora quando a análise não chega a uma resposta utilizável. */
function aguardar(motivo: string): PropostaAgente {
  return {
    acao: "aguardar",
    confianca: 0,
    tamanhoRelativo: 0,
    justificativa: motivo.slice(0, LIMITE_JUSTIFICATIVA),
    riscos: [],
    fontes: [],
  };
}

function motivoDaParada(final: BetaMessage): string | null {
  switch (final.stop_reason) {
    case "end_turn":
    case "stop_sequence":
      return null;
    case "refusal": {
      const d = final.stop_details;
      const detalhe = d
        ? ` (categoria: ${d.category ?? "não informada"}; ${d.explanation ?? "sem explicação"})`
        : "";
      return `O modelo recusou analisar este pedido${detalhe}. Sem análise, a proposta é aguardar.`;
    }
    case "max_tokens":
      return "A análise passou do limite de tokens antes de terminar a proposta. Sem proposta completa, aguardar.";
    case "tool_use":
      return "A análise não terminou dentro do limite de voltas com as ferramentas. Sem conclusão, aguardar.";
    default:
      return `A análise parou de forma inesperada (${String(final.stop_reason)}). Por segurança, aguardar.`;
  }
}

function lerProposta(final: BetaMessage): PropostaAgente {
  const textoFinal = final.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  try {
    return FORMATO_PROPOSTA.parse(textoFinal);
  } catch (e) {
    const causa = e instanceof Error ? e.message : String(e);
    throw new ErroPropostaInvalida(`O modelo devolveu uma proposta fora do esquema PropostaAgente: ${causa}`);
  }
}

function semFontesInventadas(p: PropostaAgente, registro: RegistroFontes): PropostaAgente {
  const { fontes, removidas } = registro.filtrar(p.fontes);
  if (removidas === 0) return p;
  const aviso = `${removidas} fonte(s) citada(s) sem ter sido consultada(s) foram descartadas.`;
  return { ...p, fontes, riscos: [...p.riscos.slice(0, 9), aviso] };
}

/**
 * O analista de IA: argumenta e propõe, nunca envia ordem. Roda o Tool Runner do SDK
 * com as ferramentas de leitura e devolve a proposta no formato PropostaAgente.
 */
export class Analista {
  readonly #o: OpcoesAnalista;

  constructor(opcoes: OpcoesAnalista) {
    this.#o = opcoes;
  }

  async analisar(pedido: PedidoAnalise, opcoes: OpcoesAnalise): Promise<RespostaAnalise> {
    const registro = new RegistroFontes();
    const contexto = {
      pedido,
      usuarioId: opcoes.usuarioId,
      registro,
      ...(opcoes.orcamento ? { orcamento: opcoes.orcamento } : {}),
    };
    const runner = this.#o.cliente.beta.messages.toolRunner(
      {
        model: this.#o.modelo ?? MODELO_PADRAO,
        max_tokens: this.#o.maxTokens ?? 16_000,
        max_iterations: this.#o.maxIteracoes ?? 8,
        thinking: { type: "adaptive" },
        betas: [BETA_FALLBACK],
        fallbacks: "default",
        system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
        tools: criarFerramentas(contexto, this.#o.dependencias),
        output_config: { format: FORMATO_PROPOSTA },
        messages: [
          { role: "user", content: mensagemDoPedido(pedido, (this.#o.agora ?? (() => new Date()))()) },
        ],
      },
      opcoes.signal ? { signal: opcoes.signal } : {},
    );
    const mensagens: BetaMessage[] = [];
    for await (const mensagem of runner) mensagens.push(mensagem);
    const final = mensagens.at(-1);
    if (!final) throw new ErroPropostaInvalida("A API não devolveu nenhuma mensagem; não há proposta.");

    const motivo = motivoDaParada(final);
    const proposta = motivo ? aguardar(motivo) : semFontesInventadas(lerProposta(final), registro);
    return { proposta, custoUsd: custoUsd(mensagens) };
  }
}
