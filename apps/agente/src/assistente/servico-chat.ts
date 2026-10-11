import Anthropic from "@anthropic-ai/sdk";
import type { ConfigAssistente, EventoRespostaAgente, PedidoRespostaAgente } from "@zentrade/contratos";
import { ErroClaudeCli } from "../claude-cli/analista-cli.js";
import { ErroContas } from "../claude-cli/contas.js";
import { descreverEtapa } from "../eventos/descrever.js";
import { observar } from "../ferramentas/index.js";
import type { ChatApi } from "./chat-api.js";
import type { ChatCli } from "./chat-cli.js";
import { RegistroCitacoes } from "./citacoes.js";
import { ferramentasDoChat, type DependenciasChat } from "./ferramentas-chat.js";

export type Emitir = (evento: EventoRespostaAgente) => void;

export interface OpcoesServicoChat extends DependenciasChat {
  readonly config: (usuarioId: string) => Promise<ConfigAssistente>;
  readonly api: ChatApi | null;
  readonly cli: ChatCli | null;
  readonly agora?: () => number;
  readonly aoFalhar?: (erro: unknown) => void;
}

const PROVEDOR_FORA = {
  api: "O assistente está configurado para a API da Anthropic, mas o agente não tem ANTHROPIC_API_KEY. Troque para o Claude Code em Assistente → Configurações ou peça para configurar a chave.",
  cli: "O assistente está configurado para o Claude Code, mas o CLI não está instalado no servidor do agente. Troque para a API em Assistente → Configurações.",
} as const;

/** Erro em frase para a pessoa; detalhe interno (pilha, chave, IP) fica só no log do agente. */
function traduzir(erro: unknown, sinal: AbortSignal): { codigo: string; mensagem: string } {
  if (sinal.aborted) return { codigo: "cancelado", mensagem: "A resposta foi interrompida." };
  if (erro instanceof ErroClaudeCli) return { codigo: `cli_${erro.codigo}`, mensagem: erro.message };
  if (erro instanceof ErroContas) return { codigo: "conta_cli", mensagem: erro.message };
  if (erro instanceof Anthropic.APIError) {
    const status = erro.status ?? 0;
    if (status === 401 || status === 403) {
      return {
        codigo: "api_chave",
        mensagem: "A API da Anthropic recusou a chave do agente (inválida ou sem permissão).",
      };
    }
    if (status === 429)
      return {
        codigo: "api_limite",
        mensagem: "A API da Anthropic recusou por limite de uso. Tente daqui a pouco.",
      };
    return {
      codigo: "api_falhou",
      mensagem: `A API da Anthropic falhou agora${status ? ` (código ${status})` : ""}. Tente de novo.`,
    };
  }
  return {
    codigo: "falha_agente",
    mensagem: "O assistente falhou ao responder. Tente de novo; se persistir, veja o log do agente.",
  };
}

/**
 * Uma resposta do assistente: lê a configuração da pessoa (API ou Claude Code, modelo e
 * conta), monta as ferramentas de leitura presas a ela e transmite os eventos. Sempre
 * termina com "concluido" ou "erro" — nunca em silêncio.
 */
export class ServicoChat {
  readonly #o: OpcoesServicoChat;

  constructor(o: OpcoesServicoChat) {
    this.#o = o;
  }

  async responder(pedido: PedidoRespostaAgente, emitir: Emitir, sinal: AbortSignal): Promise<void> {
    try {
      const config = await this.#o.config(pedido.usuarioId);
      const citacoes = new RegistroCitacoes();
      const ctx = { usuarioId: pedido.usuarioId, citacoes, agora: this.#o.agora ?? Date.now };
      const ferramentas = observar(ferramentasDoChat(ctx, this.#o), (nome, entrada) =>
        emitir({ tipo: "ferramenta", nome, descricao: descreverEtapa(nome, entrada) }),
      );
      const base = {
        ...pedido,
        ferramentas,
        modelo: config.modelo,
        sinal,
        aoTexto: (delta: string) => emitir({ tipo: "texto", delta }),
      };
      if (config.provedor === "cli") {
        if (!this.#o.cli) throw new ErroClaudeCli("indisponivel", PROVEDOR_FORA.cli);
        await this.#o.cli.responder({ ...base, contaId: config.contaCli });
      } else {
        if (!this.#o.api) throw new ErroClaudeCli("indisponivel", PROVEDOR_FORA.api);
        await this.#o.api.responder(base);
      }
      emitir({ tipo: "fontes", fontes: citacoes.lista });
      emitir({ tipo: "concluido", provedor: config.provedor, modelo: config.modelo });
    } catch (erro) {
      // Falha esperada do CLI (sem login, limite) não é erro do serviço; a que traz detalhe técnico vai ao log.
      const esperada = erro instanceof ErroClaudeCli && erro.detalhe === undefined;
      if (!sinal.aborted && !esperada) this.#o.aoFalhar?.(erro);
      emitir({ tipo: "erro", ...traduzir(erro, sinal) });
    }
  }
}
