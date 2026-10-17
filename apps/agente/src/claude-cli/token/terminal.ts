import { spawn } from "node:child_process";
import { StringDecoder } from "node:string_decoder";

/**
 * O `claude setup-token` é um app de terminal (lê a tecla, desenha a tela): sem um
 * terminal de verdade ele não mostra o link nem aceita o código. O `script` (util-linux)
 * cria um pseudo-terminal e roda o CLI dentro dele; o que entra pela stdin do `script`
 * vira teclado do CLI e a tela volta pela stdout. Nada de módulo nativo (node-pty): só um
 * utilitário do sistema, instalado na imagem do agente (util-linux-misc no Alpine).
 *
 * Sem shell com dado da pessoa: a linha do shell só leva o caminho do executável (validado
 * por resolverClaude) entre aspas simples. O processo nasce num grupo próprio; matar o
 * grupo fecha o terminal, e o CLI recebe SIGHUP.
 */
export interface Terminal {
  escrever(texto: string): void;
  /** Cada pedaço de saída (texto cru, com códigos de cor), na ordem. */
  aoTexto(ouvinte: (pedaco: string) => void): void;
  /** Resolve quando o processo termina (por conta própria ou morto). */
  readonly terminou: Promise<void>;
  matar(): void;
}

export interface OpcoesTerminal {
  readonly claude: string;
  /** Caminho do `script`. `null` = roda o CLI direto, sem terminal (só os testes, com o falso). */
  readonly script: string | null;
  readonly env: Readonly<Record<string, string>>;
  readonly cwd: string;
}

const ESPERA_ANTES_DO_KILL_MS = 3000;
/** Larga o bastante para o link de autorização caber numa linha só (o app quebra no fim da linha). */
const COLUNAS = 4000;

/** A linha que o `script` passa ao /bin/sh: ajusta o tamanho do terminal e troca de processo. */
export function linhaDoShell(claude: string): string {
  if (!claude.startsWith("/") || /['\n\r\0]/.test(claude)) {
    throw new Error("caminho do Claude Code inválido para o terminal");
  }
  return `stty cols ${COLUNAS} rows 50 2>/dev/null; exec '${claude}' setup-token`;
}

function matarGrupo(pid: number | undefined, sinal: NodeJS.Signals): void {
  if (!pid) return;
  try {
    process.kill(-pid, sinal);
  } catch {
    // o grupo já acabou
  }
}

export function abrirTerminal(o: OpcoesTerminal): Terminal {
  const [comando, args] = o.script
    ? [o.script, ["-qfec", linhaDoShell(o.claude), "/dev/null"]]
    : [o.claude, ["setup-token"]];
  const filho = spawn(comando, args, { cwd: o.cwd, env: o.env, detached: true, stdio: "pipe" });
  const ouvintes: ((pedaco: string) => void)[] = [];
  const decodificador = new StringDecoder("utf8");
  const entregar = (pedaco: Buffer) => {
    const texto = decodificador.write(pedaco);
    if (texto) for (const ouvir of ouvintes) ouvir(texto);
  };
  filho.stdout.on("data", entregar);
  filho.stderr.on("data", entregar);
  filho.stdin.on("error", () => undefined); // EPIPE: o CLI saiu
  const terminou = new Promise<void>((resolver) => {
    filho.on("error", () => resolver());
    filho.on("close", () => resolver());
  });
  let morto = false;
  return {
    escrever: (texto) => {
      if (!filho.stdin.destroyed) filho.stdin.write(texto);
    },
    aoTexto: (ouvinte) => void ouvintes.push(ouvinte),
    terminou,
    matar: () => {
      if (morto) return;
      morto = true;
      matarGrupo(filho.pid, "SIGTERM");
      const forcar = setTimeout(() => matarGrupo(filho.pid, "SIGKILL"), ESPERA_ANTES_DO_KILL_MS);
      forcar.unref();
      void terminou.then(() => clearTimeout(forcar));
    },
  };
}
