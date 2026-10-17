import { randomUUID } from "node:crypto";
import type { ConexaoClaude, EstadoTokenClaude } from "@zentrade/contratos";
import { ambienteLimpo } from "../ambiente.js";
import { criarPastaExecucao, type PastaExecucao } from "../pasta.js";
import { acharLink, acharToken, codigoRecusado, semControles } from "./saida.js";
import { abrirTerminal, type OpcoesTerminal, type Terminal } from "./terminal.js";

/**
 * "Conectar meu Claude" pela tela, sem ninguém abrir terminal: o agente roda o
 * `claude setup-token` oficial num pseudo-terminal, entrega o link de autorização (só se
 * for da Anthropic), recebe o código que a pessoa colou, pega o token que o CLI imprime e
 * o grava cifrado. O ZenTrade não reimplementa o OAuth da Anthropic (ADR 008).
 *
 * Uma conexão viva por pessoa (começar outra cancela a anterior), guardada só na memória
 * do agente e conferida pelo usuarioId a cada chamada. Cada uma tem uma pasta 0700 com um
 * CLAUDE_CONFIG_DIR novo e vazio, apagada no fim. Vence em 10 min. A saída do CLI pode
 * trazer o token: ela nunca vai para log, erro ou resposta.
 */
export class ErroConexaoClaude extends Error {
  override name = "ErroConexaoClaude";
  constructor(
    readonly status: number,
    readonly codigo: string,
    mensagem: string,
  ) {
    super(mensagem);
  }
}

export interface OpcoesConexoes {
  readonly claude: string;
  /** O `script` do util-linux; `null` só nos testes (CLI falso direto, sem terminal). */
  readonly script: string | null;
  readonly env: Readonly<Record<string, string | undefined>>;
  /** Cifra e grava o token da pessoa (credenciais_claude). */
  readonly salvar: (usuarioId: string, token: string) => Promise<EstadoTokenClaude>;
  readonly agora?: () => number;
  /** Quanto tempo a conexão espera o código (padrão 10 min). */
  readonly validadeMs?: number;
  /** Quanto o CLI tem para mostrar o link (padrão 45 s) e para entregar o token (90 s). */
  readonly esperaLinkMs?: number;
  readonly esperaTokenMs?: number;
  /** Conexões começadas por pessoa por hora (padrão 5) e vivas no agente (padrão 10). */
  readonly maxPorHora?: number;
  readonly maxSimultaneas?: number;
  /** Pausa entre colar o código e apertar Enter (o app trata o código como colagem). */
  readonly atrasoEnterMs?: number;
  /** Para os testes trocarem o terminal. */
  readonly abrir?: (o: OpcoesTerminal) => Terminal;
}

interface Sessao {
  readonly id: string;
  readonly usuarioId: string;
  readonly expiraEm: number;
  readonly terminal: Terminal;
  readonly pasta: PastaExecucao;
  /** A tela desde o começo (ou desde o código colado), sem cores; nunca sai daqui. */
  tela: string;
  ocupada: boolean;
  encerrada: boolean;
  relogio: NodeJS.Timeout | null;
  readonly ouvintes: Set<() => void>;
}

type Espera<T> = { readonly tipo: "achou"; readonly valor: T } | { readonly tipo: "terminou" | "tempo" };

const HORA = 3_600_000;
const RECUSADO = Symbol("recusado");
const LIMITE_TELA = 64 * 1024;

const naoEncontrada = () =>
  new ErroConexaoClaude(
    404,
    "conexao_nao_encontrada",
    "Essa conexão não existe mais (venceu ou foi cancelada). Comece de novo.",
  );

/** O ambiente do setup-token: o limpo do agente, sem CI (o app só desenharia no fim) e com a pasta nova. */
function ambienteDaConexao(o: OpcoesConexoes, configDir: string): Record<string, string> {
  const { CI: _ci, ...env } = ambienteLimpo(
    o.env,
    { CLAUDE_CONFIG_DIR: configDir, TERM: "xterm-256color" },
    o.claude,
  );
  return env;
}

export class ConexoesClaude {
  readonly #o: OpcoesConexoes;
  readonly #agora: () => number;
  readonly #sessoes = new Map<string, Sessao>();
  readonly #inicios = new Map<string, readonly number[]>();

  constructor(o: OpcoesConexoes) {
    this.#o = o;
    this.#agora = o.agora ?? Date.now;
  }

  /** Quantas conexões estão vivas (para o teste e o estado). */
  get vivas(): number {
    return this.#sessoes.size;
  }

  async iniciar(usuarioId: string): Promise<ConexaoClaude> {
    this.#conferirLimite(usuarioId);
    const anterior = this.#sessoes.get(usuarioId);
    if (anterior) await this.#encerrar(anterior);
    if (this.#sessoes.size >= (this.#o.maxSimultaneas ?? 10)) {
      throw new ErroConexaoClaude(
        503,
        "conexoes_ocupadas",
        "Muitas pessoas conectando o Claude agora. Tente daqui a um minuto.",
      );
    }
    const s = await this.#abrir(usuarioId);
    const link = await this.#esperar(s, acharLink, this.#o.esperaLinkMs ?? 45_000);
    if (link.tipo === "achou" && link.valor.tipo === "ok") {
      return { conexaoId: s.id, urlAutorizacao: link.valor.url, expiraEm: s.expiraEm };
    }
    await this.#encerrar(s);
    if (link.tipo === "achou") {
      throw new ErroConexaoClaude(
        502,
        "link_fora_da_anthropic",
        "O Claude Code mostrou um endereço de autorização fora da Anthropic. Por segurança, a conexão foi cancelada.",
      );
    }
    throw link.tipo === "tempo"
      ? new ErroConexaoClaude(
          504,
          "conexao_sem_link",
          "O Claude Code não mostrou o link de autorização a tempo. Tente de novo em instantes.",
        )
      : new ErroConexaoClaude(
          502,
          "conexao_falhou",
          "O Claude Code fechou antes de mostrar o link de autorização. Tente de novo; se continuar, quem opera o servidor confere o Claude Code no agente.",
        );
  }

  /** Cola o código no CLI e espera o token; com ele, grava cifrado e encerra a conexão. */
  async enviarCodigo(usuarioId: string, conexaoId: string, codigo: string): Promise<EstadoTokenClaude> {
    const s = this.#sessaoDa(usuarioId, conexaoId);
    if (s.ocupada) {
      throw new ErroConexaoClaude(409, "codigo_em_andamento", "O código já está sendo conferido. Aguarde.");
    }
    s.ocupada = true;
    s.tela = "";
    s.terminal.escrever(codigo);
    await new Promise((r) => setTimeout(r, this.#o.atrasoEnterMs ?? 250));
    s.terminal.escrever("\r");
    const r = await this.#esperar(
      s,
      (tela) => acharToken(tela) ?? (codigoRecusado(tela) ? RECUSADO : null),
      this.#o.esperaTokenMs ?? 90_000,
    );
    await this.#encerrar(s);
    if (r.tipo === "achou" && r.valor !== RECUSADO) return this.#salvar(usuarioId, r.valor);
    if (r.tipo === "achou") {
      throw new ErroConexaoClaude(
        422,
        "codigo_recusado",
        "O Claude não aceitou esse código (errado, incompleto ou vencido). Comece a conexão de novo e cole o código assim que ele aparecer.",
      );
    }
    throw r.tipo === "tempo"
      ? new ErroConexaoClaude(
          504,
          "conexao_sem_resposta",
          "O Claude não respondeu a tempo. Comece a conexão de novo.",
        )
      : new ErroConexaoClaude(
          502,
          "conexao_falhou",
          "O Claude Code fechou sem entregar o token. Comece a conexão de novo.",
        );
  }

  /** Cancela a conexão da pessoa (só a dela). `false` = não havia essa conexão. */
  async cancelar(usuarioId: string, conexaoId: string): Promise<boolean> {
    const s = this.#sessoes.get(usuarioId);
    if (!s || s.id !== conexaoId) return false;
    await this.#encerrar(s);
    return true;
  }

  async encerrarTodas(): Promise<void> {
    await Promise.all([...this.#sessoes.values()].map((s) => this.#encerrar(s)));
  }

  #conferirLimite(usuarioId: string): void {
    const agora = this.#agora();
    const recentes = (this.#inicios.get(usuarioId) ?? []).filter((t) => agora - t < HORA);
    if (recentes.length >= (this.#o.maxPorHora ?? 5)) {
      throw new ErroConexaoClaude(
        429,
        "limite_conexoes",
        "Você já começou várias conexões na última hora. Espere um pouco e tente de novo.",
      );
    }
    this.#inicios.set(usuarioId, [...recentes, agora]);
  }

  async #abrir(usuarioId: string): Promise<Sessao> {
    const pasta = await criarPastaExecucao();
    let terminal: Terminal;
    try {
      const configDir = await pasta.criarSubpasta("config");
      terminal = (this.#o.abrir ?? abrirTerminal)({
        claude: this.#o.claude,
        script: this.#o.script,
        env: ambienteDaConexao(this.#o, configDir),
        cwd: pasta.caminho,
      });
    } catch (e) {
      await pasta.apagar();
      throw e;
    }
    const s: Sessao = {
      id: randomUUID(),
      usuarioId,
      expiraEm: this.#agora() + (this.#o.validadeMs ?? 600_000),
      terminal,
      pasta,
      tela: "",
      ocupada: false,
      encerrada: false,
      relogio: null,
      ouvintes: new Set(),
    };
    terminal.aoTexto((pedaco) => {
      s.tela = (s.tela + semControles(pedaco)).slice(-LIMITE_TELA);
      for (const avisar of s.ouvintes) avisar();
    });
    void terminal.terminou.then(() => {
      // O processo acabou: o que estava no fim da tela já chegou inteiro.
      s.tela += "\n";
      for (const avisar of s.ouvintes) avisar();
      void this.#encerrar(s);
    });
    s.relogio = setTimeout(() => void this.#encerrar(s), this.#o.validadeMs ?? 600_000);
    s.relogio.unref();
    this.#sessoes.set(usuarioId, s);
    return s;
  }

  /** Só a conexão da própria pessoa, com o id certo e no prazo; o resto é "não existe". */
  #sessaoDa(usuarioId: string, conexaoId: string): Sessao {
    const s = this.#sessoes.get(usuarioId);
    if (!s || s.id !== conexaoId || s.encerrada) throw naoEncontrada();
    if (this.#agora() > s.expiraEm) {
      void this.#encerrar(s);
      throw naoEncontrada();
    }
    return s;
  }

  /** Espera a tela mostrar o que `achar` procura, o processo acabar ou o prazo vencer. */
  #esperar<T>(s: Sessao, achar: (tela: string) => T | null, prazoMs: number): Promise<Espera<T>> {
    return new Promise((resolver) => {
      const conferir = () => {
        const valor = achar(s.tela);
        if (valor !== null) return fim({ tipo: "achou", valor });
        if (s.encerrada) fim({ tipo: "terminou" });
      };
      const relogio = setTimeout(() => fim({ tipo: "tempo" }), prazoMs);
      const fim = (r: Espera<T>) => {
        clearTimeout(relogio);
        s.ouvintes.delete(conferir);
        resolver(r);
      };
      s.ouvintes.add(conferir);
      conferir();
    });
  }

  async #salvar(usuarioId: string, token: string): Promise<EstadoTokenClaude> {
    try {
      return await this.#o.salvar(usuarioId, token);
    } catch {
      // Sem o erro original: ele poderia citar o valor que tentou gravar.
      throw new ErroConexaoClaude(
        500,
        "token_nao_gravado",
        "O Claude entregou o token, mas não deu para guardá-lo agora. Comece a conexão de novo.",
      );
    }
  }

  async #encerrar(s: Sessao): Promise<void> {
    if (s.encerrada) return;
    s.encerrada = true;
    if (s.relogio) clearTimeout(s.relogio);
    if (this.#sessoes.get(s.usuarioId) === s) this.#sessoes.delete(s.usuarioId);
    for (const avisar of s.ouvintes) avisar();
    s.tela = "";
    s.terminal.matar();
    await s.terminal.terminou;
    await s.pasta.apagar().catch(() => undefined);
  }
}
