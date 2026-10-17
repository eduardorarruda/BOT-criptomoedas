import type { FerramentaLeitura } from "../ferramentas/index.js";
import type { SessoesPonte } from "../ponte/sessoes.js";
import { ambienteLimpo } from "./ambiente.js";
import { argumentosAnalise, argumentosChat, argumentosTeste, configuracaoMcp } from "./comando.js";
import { escolherConta, type ContaClaude } from "./contas.js";
import { ErroClaudeCli } from "./analista-cli.js";
import { criarPastaExecucao, type PastaExecucao } from "./pasta.js";
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
  /** O token do Claude Code que cada pessoa conectou (sem chave mestra no agente: ausente). */
  readonly tokens?: FonteTokensClaude;
}

/** De onde o executor tira o token guardado de cada pessoa (decifrado na hora, sem cache). */
export interface FonteTokensClaude {
  token(usuarioId: string): Promise<string | null>;
  /** O Claude recusou o token (expirou, foi revogado): a tela mostra o erro. */
  registrarErro(usuarioId: string, mensagem: string): Promise<void>;
}

/** Com qual login o CLI rodou: o token da pessoa ou a pasta de uma conta do servidor. */
export type Credencial =
  | { readonly tipo: "token"; readonly token: string }
  | { readonly tipo: "conta"; readonly conta: ContaClaude };

export const MENSAGEM_TOKEN_RECUSADO =
  "O Claude recusou o token que você conectou (expirou ou foi revogado). Reconecte o seu Claude em Assistente → Configurações.";

export interface PedidoExecucao {
  /** De quem é a execução: decide o login (o token da pessoa vem antes das contas). */
  readonly usuarioId: string;
  readonly ferramentas: readonly FerramentaLeitura[];
  readonly instrucoes: string;
  /** O que vai pela entrada padrão (o pedido ou a pergunta). */
  readonly entrada: string;
  readonly modelo: string | null;
  readonly contaId: string | null;
  readonly tempoMs: number;
  readonly sinal?: AbortSignal;
  readonly modo:
    | { readonly tipo: "analise"; readonly esquema: object }
    | { readonly tipo: "chat" }
    /** A chamada mínima do botão Testar: só com o token da pessoa, 1 volta, teto baixo. */
    | { readonly tipo: "teste"; readonly tetoUsd: number };
  readonly aoLinha?: (linha: string) => void;
}

export interface ExecucaoCli {
  readonly fim: FimProcesso;
  readonly resultado: ResultadoCli | null;
  readonly falha: FalhaCli | null;
  readonly credencial: Credencial["tipo"];
}

/** A pessoa pediu o teste do token, mas não conectou o Claude. */
export class ErroSemToken extends Error {
  override name = "ErroSemToken";
  constructor() {
    super("Você ainda não conectou o seu Claude. Conecte em Assistente → Configurações.");
  }
}

/** Só as últimas linhas importam no fim (o "result"); o resto já foi entregue a `aoLinha`. */
const LINHAS_GUARDADAS = 20;

/**
 * Uma execução do `claude -p`: abre a sessão da ponte com as ferramentas desta execução,
 * grava a configuração do MCP e as instruções numa pasta 0700 só dela, roda o CLI com o
 * ambiente limpo e o login da pessoa, e no fim fecha a sessão e apaga a pasta — mesmo se
 * der erro. O login, nesta ordem:
 * 1. o token que a pessoa conectou (CLAUDE_CODE_OAUTH_TOKEN), com um CLAUDE_CONFIG_DIR novo
 *    e vazio dentro da pasta da execução (nada do servidor se mistura, nada fica gravado);
 * 2. sem token, a pasta de login da conta escolhida (AGENTE_CLAUDE_CONTAS), como antes.
 * O token só vai no ambiente do processo filho: nunca na linha de comando nem no log.
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

  /** O token da pessoa, se ela conectou e o agente sabe decifrar; senão a conta do servidor. */
  async credencial(usuarioId: string, contaId: string | null): Promise<Credencial> {
    const token = this.#c.tokens ? await this.#tokenDa(usuarioId, this.#c.tokens) : null;
    if (token) return { tipo: "token", token };
    return { tipo: "conta", conta: escolherConta(this.#c.contas, contaId) };
  }

  async #tokenDa(usuarioId: string, tokens: FonteTokensClaude): Promise<string | null> {
    try {
      return await tokens.token(usuarioId);
    } catch {
      // Sem cair para a conta do servidor: seria usar o plano de outra pessoa sem ela saber.
      throw new ErroClaudeCli(
        "token",
        "Não deu para abrir o token do Claude guardado neste servidor (a chave mestra mudou ou o banco falhou). Conecte o seu Claude de novo em Assistente → Configurações.",
      );
    }
  }

  async executar(p: PedidoExecucao): Promise<ExecucaoCli> {
    const credencial = await this.credencial(p.usuarioId, p.contaId);
    if (p.modo.tipo === "teste" && credencial.tipo !== "token") throw new ErroSemToken();
    const sessao = this.#sessoes.abrir(p.ferramentas, p.tempoMs + 30_000);
    const pasta = await criarPastaExecucao();
    try {
      const configMcp = await pasta.gravar("mcp.json", this.#configPonte(sessao.acesso));
      const instrucoes = await pasta.gravar("instrucoes.md", p.instrucoes);
      const teste = p.modo.tipo === "teste";
      const parametros = {
        configMcp,
        instrucoes,
        modelo: p.modelo,
        maxTurnos: teste ? 1 : this.#c.maxTurnos,
        tetoUsd: p.modo.tipo === "teste" ? Math.min(p.modo.tetoUsd, this.#c.tetoUsd) : this.#c.tetoUsd,
      };
      const linhas: string[] = [];
      const fim = await rodarProcesso({
        caminho: this.#c.caminho,
        args:
          p.modo.tipo === "analise"
            ? argumentosAnalise(parametros, p.modo.esquema)
            : teste
              ? argumentosTeste(parametros)
              : argumentosChat(parametros),
        cwd: pasta.caminho,
        env: ambienteLimpo(this.#c.env, await loginNoAmbiente(credencial, pasta), this.#c.caminho),
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
      const falha = await this.#falhaDoToken(
        p.usuarioId,
        credencial,
        explicarFalha(fim, p.tempoMs, resultado),
      );
      return { fim, resultado, falha, credencial: credencial.tipo };
    } finally {
      sessao.fechar();
      await pasta.apagar();
    }
  }

  /** Token recusado: a mensagem manda reconectar (não "fazer login no servidor") e a tela fica sabendo. */
  async #falhaDoToken(usuarioId: string, c: Credencial, falha: FalhaCli | null): Promise<FalhaCli | null> {
    if (c.tipo !== "token" || falha?.codigo !== "autenticacao") return falha;
    await this.#c.tokens?.registrarErro(usuarioId, MENSAGEM_TOKEN_RECUSADO).catch(() => undefined);
    return { ...falha, mensagem: MENSAGEM_TOKEN_RECUSADO };
  }

  #configPonte(acesso: string): string {
    return configuracaoMcp({
      comando: process.execPath,
      args: [this.#c.caminhoPonte],
      env: { ZT_PONTE_URL: `${this.#c.urlAgente}/ponte/ferramentas`, ZT_PONTE_ACESSO: acesso },
    });
  }
}

/** As variáveis do login: o token com uma pasta de configuração nova, ou a pasta da conta. */
async function loginNoAmbiente(c: Credencial, pasta: PastaExecucao): Promise<Record<string, string>> {
  if (c.tipo === "token") {
    return { CLAUDE_CODE_OAUTH_TOKEN: c.token, CLAUDE_CONFIG_DIR: await pasta.criarSubpasta("config") };
  }
  return c.conta.pasta ? { CLAUDE_CONFIG_DIR: c.conta.pasta } : {};
}
