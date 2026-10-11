import type { ConfigAssistente, PedidoAnalise, RespostaAnalise } from "@zentrade/contratos";
import type { OpcoesAnalise } from "../analista.js";

export interface AnalistaDeUmProvedor {
  analisar(pedido: PedidoAnalise, opcoes: OpcoesAnalise): Promise<RespostaAnalise>;
}

/** O provedor escolhido pela pessoa não está disponível neste agente (sem chave ou sem CLI). */
export class ErroProvedorIndisponivel extends Error {
  override name = "ErroProvedorIndisponivel";
}

const MENSAGENS = {
  api: "A pessoa escolheu a API da Anthropic, mas o agente não tem ANTHROPIC_API_KEY. Sem análise, o robô não opera.",
  cli: "A pessoa escolheu o Claude Code, mas o CLI não está instalado no agente. Sem análise, o robô não opera.",
} as const;

export interface OpcoesAnalistaPorPessoa {
  readonly api: AnalistaDeUmProvedor | null;
  readonly cli: AnalistaDeUmProvedor | null;
  readonly config: (usuarioId: string) => Promise<ConfigAssistente>;
}

/**
 * O analista de cada pessoa: lê a configuração dela (provedor, modelo, conta do Claude
 * Code) a cada pedido — sem cache, para a troca na tela valer na próxima análise — e
 * repassa para o provedor certo. Os dois só propõem; a saída é sempre PropostaAgente.
 */
export class AnalistaPorPessoa {
  readonly #o: OpcoesAnalistaPorPessoa;

  constructor(o: OpcoesAnalistaPorPessoa) {
    this.#o = o;
  }

  async analisar(pedido: PedidoAnalise, opcoes: OpcoesAnalise): Promise<RespostaAnalise> {
    const config = await this.#o.config(opcoes.usuarioId);
    const alvo = this.#o[config.provedor];
    if (!alvo) throw new ErroProvedorIndisponivel(MENSAGENS[config.provedor]);
    return alvo.analisar(pedido, {
      ...opcoes,
      ...(config.modelo ? { modelo: config.modelo } : {}),
      ...(config.provedor === "cli" && config.contaCli ? { contaCli: config.contaCli } : {}),
    });
  }
}

/**
 * A configuração de cada pessoa, ou o padrão do serviço para quem nunca escolheu: a API
 * quando o agente tem a chave da Anthropic; senão, o Claude Code.
 */
export function configComPadrao(
  gravada: (usuarioId: string) => Promise<ConfigAssistente | null>,
  provedorPadrao: ConfigAssistente["provedor"],
): (usuarioId: string) => Promise<ConfigAssistente> {
  return async (usuarioId) =>
    (await gravada(usuarioId)) ?? { provedor: provedorPadrao, modelo: null, contaCli: null };
}
