import type { FerramentaLeitura } from "../ferramentas/index.js";
import type { SessoesPonte } from "../ponte/sessoes.js";
import { ambienteLimpo } from "./ambiente.js";
import { argumentosAnalise, argumentosChat, configuracaoMcp } from "./comando.js";
import { escolherConta, type ContaClaude } from "./contas.js";
import { criarPastaExecucao } from "./pasta.js";
import { rodarProcesso, type FimProcesso } from "./processo.js";
import { explicarFalha, lerResultado, type FalhaCli, type ResultadoCli } from "./resultado.js";

export interface ConfigClaudeCli {
  /** Executável do Claude Code (caminho absoluto ou nome no PATH). */
  readonly caminho: string;
  readonly contas: readonly ContaClaude[];
  /** Onde a ponte acha o agente: sempre na mesma máquina (http://127.0.0.1:<porta>). */
  readonly urlAgente: string;
  /** O script da ponte MCP (dist/ponte/bin.js). */
  readonly caminhoPonte: string;
  /** Teto de voltas (chamadas ao modelo) e de custo em US$ por execução. */
  readonly maxTurnos: number;
  readonly tetoUsd: number;
  /** Ambiente de onde sai o ambiente limpo do CLI (o do agente). */
  readonly env: Readonly<Record<string, string | undefined>>;
}

export interface PedidoExecucao {
  readonly ferramentas: readonly FerramentaLeitura[];
  readonly instrucoes: string;
  /** O que vai pela entrada padrão (o pedido ou a pergunta). */
  readonly entrada: string;
  readonly modelo: string | null;
  readonly contaId: string | null;
  readonly tempoMs: number;
  readonly sinal?: AbortSignal;
  readonly modo: { readonly tipo: "analise"; readonly esquema: object } | { readonly tipo: "chat" };
  readonly aoLinha?: (linha: string) => void;
}

export interface ExecucaoCli {
  readonly fim: FimProcesso;
  readonly resultado: ResultadoCli | null;
  readonly falha: FalhaCli | null;
}

/** Só as últimas linhas importam no fim (o "result"); o resto já foi entregue a `aoLinha`. */
const LINHAS_GUARDADAS = 20;

/**
 * Uma execução do `claude -p`: abre a sessão da ponte com as ferramentas desta execução,
 * grava a configuração do MCP e as instruções numa pasta 0700 só dela, roda o CLI com o
 * ambiente limpo e a pasta de login da conta escolhida (CLAUDE_CONFIG_DIR), e no fim fecha
 * a sessão e apaga a pasta — mesmo se der erro.
 */
export class ExecutorClaude {
  readonly #c: ConfigClaudeCli;
  readonly #sessoes: SessoesPonte;

  constructor(config: ConfigClaudeCli, sessoes: SessoesPonte) {
    this.#c = config;
    this.#sessoes = sessoes;
  }

  get contas(): readonly ContaClaude[] {
    return this.#c.contas;
  }

  async executar(p: PedidoExecucao): Promise<ExecucaoCli> {
    const conta = escolherConta(this.#c.contas, p.contaId);
    const sessao = this.#sessoes.abrir(p.ferramentas, p.tempoMs + 30_000);
    const pasta = await criarPastaExecucao();
    try {
      const configMcp = await pasta.gravar("mcp.json", this.#configPonte(sessao.acesso));
      const instrucoes = await pasta.gravar("instrucoes.md", p.instrucoes);
      const parametros = {
        configMcp,
        instrucoes,
        modelo: p.modelo,
        maxTurnos: this.#c.maxTurnos,
        tetoUsd: this.#c.tetoUsd,
      };
      const linhas: string[] = [];
      const fim = await rodarProcesso({
        caminho: this.#c.caminho,
        args:
          p.modo.tipo === "analise"
            ? argumentosAnalise(parametros, p.modo.esquema)
            : argumentosChat(parametros),
        cwd: pasta.caminho,
        env: ambienteLimpo(
          this.#c.env,
          conta.pasta ? { CLAUDE_CONFIG_DIR: conta.pasta } : {},
          this.#c.caminho,
        ),
        entrada: p.entrada,
        tempoMaximoMs: p.tempoMs,
        ...(p.sinal ? { sinal: p.sinal } : {}),
        aoLinha: (linha) => {
          linhas.push(linha);
          if (linhas.length > LINHAS_GUARDADAS) linhas.shift();
          p.aoLinha?.(linha);
        },
      });
      const resultado = lerResultado(linhas);
      return { fim, resultado, falha: explicarFalha(fim, p.tempoMs, resultado) };
    } finally {
      sessao.fechar();
      await pasta.apagar();
    }
  }

  #configPonte(acesso: string): string {
    return configuracaoMcp({
      comando: process.execPath,
      args: [this.#c.caminhoPonte],
      env: { ZT_PONTE_URL: `${this.#c.urlAgente}/ponte/ferramentas`, ZT_PONTE_ACESSO: acesso },
    });
  }
}
