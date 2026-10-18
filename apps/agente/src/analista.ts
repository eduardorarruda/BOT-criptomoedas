import type Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { BetaMessage, BetaMessageParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import {
  PropostaGeradaEsquema,
  type PedidoAnalise,
  type PropostaAgente,
  type PropostaGerada,
  type RespostaAnalise,
} from "@zentrade/contratos";
import { aplicarRegraDosCenarios, LIMIAR_PADRAO } from "./cenarios.js";
import { custoUsd } from "./custo.js";
import {
  criarFerramentas,
  RegistroFontes,
  type AoFalharFerramenta,
  type AoUsarFerramenta,
  type DependenciasFerramentas,
} from "./ferramentas/index.js";
import { buscarContextoPrevio } from "./pedido/previo.js";
import { mensagemDoPedido, SYSTEM_PROMPT } from "./prompt.js";
import type { OrcamentoRisco } from "./serializacao.js";

export const MODELO_PADRAO = "claude-opus-5";
const BETA_FALLBACK = "server-side-fallback-2026-07-01";
/** A geração nova: com os três cenários e o contra-argumento (Zod valida a soma e os nomes). */
const FORMATO_PROPOSTA = betaZodOutputFormat(PropostaGeradaEsquema);

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
  /** Ferramenta que lançou: o detalhe vai para o log; o modelo lê só uma frase curta. */
  readonly aoFalharFerramenta?: AoFalharFerramenta;
  /** Probabilidade mínima do cenário favorável para abrir posição (AGENTE_CENARIO_LIMIAR). */
  readonly limiarCenarios?: number;
  /** Fuso da hora no pedido (ZENTRADE_FUSO). */
  readonly fuso?: string;
}

export interface OpcoesAnalise {
  readonly usuarioId: string;
  readonly orcamento?: OrcamentoRisco;
  readonly signal?: AbortSignal;
  /** Modelo escolhido pela pessoa; sem ele, o do serviço (AGENTE_MODELO). */
  readonly modelo?: string;
  /** Conta do Claude Code (só no provedor "cli"). */
  readonly contaCli?: string;
  /** Avisado a cada ferramenta consultada (eventos "analise" ao vivo). */
  readonly aoUsarFerramenta?: AoUsarFerramenta;
}

const LIMITE_JUSTIFICATIVA = 2000;

/** Proposta conservadora quando a análise não chega a uma resposta utilizável. */
export function aguardar(motivo: string): PropostaAgente {
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

const textoDe = (final: BetaMessage): string =>
  final.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");

type Lida =
  { readonly ok: true; readonly proposta: PropostaGerada } | { readonly ok: false; readonly erro: string };

function lerProposta(final: BetaMessage): Lida {
  try {
    return { ok: true, proposta: FORMATO_PROPOSTA.parse(textoDe(final)) };
  } catch (e) {
    const causa = e instanceof Error ? e.message : String(e);
    return { ok: false, erro: causa.slice(0, 1500) };
  }
}

/** O pedido de correção da segunda (e última) tentativa, com o erro da validação. */
export const correcaoDoFormato = (erro: string): string =>
  `A sua resposta anterior foi recusada pela validação do formato: ${erro}\n` +
  "Devolva a proposta completa de novo, no mesmo formato, corrigindo isso (três cenários distintos — alta, lateral e baixa — com probabilidades que somam 1, e o contraArgumento).";

/** Duas propostas fora do formato: não opera. */
export const motivoFormatoInvalido = (erro: string): string =>
  `O modelo devolveu a proposta fora do formato duas vezes (${erro.slice(0, 600)}). Sem proposta válida, aguardar.`;

/** Fonte inventada fora, depois a regra determinística dos cenários. */
export function finalizarProposta(
  gerada: PropostaGerada,
  pedido: PedidoAnalise,
  registro: RegistroFontes,
  limiar: number = LIMIAR_PADRAO,
): PropostaAgente {
  return aplicarRegraDosCenarios(semFontesInventadas(gerada, registro), pedido, limiar);
}

/** Fonte citada que nenhuma ferramenta devolveu é descartada, com aviso nos riscos. */
export function semFontesInventadas<P extends PropostaAgente>(p: P, registro: RegistroFontes): P {
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
    const agora = (this.#o.agora ?? (() => new Date()))();
    const previo = await buscarContextoPrevio(pedido, opcoes.usuarioId, this.#o.dependencias, agora);
    const pergunta: BetaMessageParam = {
      role: "user",
      content: mensagemDoPedido(pedido, agora, { previo, fuso: this.#o.fuso ?? this.#o.dependencias.fuso }),
    };
    const primeira = await this.#rodar(pedido, opcoes, registro, [pergunta]);
    const final = primeira.at(-1);
    if (!final) throw new ErroPropostaInvalida("A API não devolveu nenhuma mensagem; não há proposta.");
    const parada = motivoDaParada(final);
    if (parada) return { proposta: aguardar(parada), custoUsd: custoUsd(primeira) };
    const lida = lerProposta(final);
    if (lida.ok) return this.#resposta(lida.proposta, pedido, registro, primeira);

    // Uma nova tentativa, com o erro da validação; se falhar de novo, aguardar.
    const anterior: BetaMessageParam = { role: "assistant", content: textoDe(final) || "(sem texto)" };
    const correcao: BetaMessageParam = { role: "user", content: correcaoDoFormato(lida.erro) };
    const segunda = await this.#rodar(pedido, opcoes, registro, [pergunta, anterior, correcao]);
    const todas = [...primeira, ...segunda];
    const final2 = segunda.at(-1);
    const parada2 = final2 ? motivoDaParada(final2) : "A segunda tentativa não devolveu mensagem.";
    if (!final2 || parada2) return { proposta: aguardar(parada2 ?? ""), custoUsd: custoUsd(todas) };
    const lida2 = lerProposta(final2);
    if (lida2.ok) return this.#resposta(lida2.proposta, pedido, registro, todas);
    return { proposta: aguardar(motivoFormatoInvalido(lida2.erro)), custoUsd: custoUsd(todas) };
  }

  #resposta(
    gerada: PropostaGerada,
    pedido: PedidoAnalise,
    registro: RegistroFontes,
    mensagens: readonly BetaMessage[],
  ): RespostaAnalise {
    return {
      proposta: finalizarProposta(gerada, pedido, registro, this.#o.limiarCenarios),
      custoUsd: custoUsd(mensagens),
    };
  }

  async #rodar(
    pedido: PedidoAnalise,
    opcoes: OpcoesAnalise,
    registro: RegistroFontes,
    messages: BetaMessageParam[],
  ): Promise<BetaMessage[]> {
    const contexto = {
      pedido,
      usuarioId: opcoes.usuarioId,
      registro,
      ...(opcoes.orcamento ? { orcamento: opcoes.orcamento } : {}),
    };
    const runner = this.#o.cliente.beta.messages.toolRunner(
      {
        model: opcoes.modelo ?? this.#o.modelo ?? MODELO_PADRAO,
        max_tokens: this.#o.maxTokens ?? 16_000,
        max_iterations: this.#o.maxIteracoes ?? 8,
        thinking: { type: "adaptive" },
        betas: [BETA_FALLBACK],
        fallbacks: "default",
        system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
        tools: criarFerramentas(
          contexto,
          this.#o.dependencias,
          opcoes.aoUsarFerramenta,
          this.#o.aoFalharFerramenta,
        ),
        output_config: { format: FORMATO_PROPOSTA },
        messages,
      },
      opcoes.signal ? { signal: opcoes.signal } : {},
    );
    const mensagens: BetaMessage[] = [];
    for await (const mensagem of runner) mensagens.push(mensagem);
    return mensagens;
  }
}
