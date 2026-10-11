import { spawn } from "node:child_process";
import { StringDecoder } from "node:string_decoder";

/**
 * Roda o CLI como processo filho: sem shell (lista de argumentos), entrada pela stdin e
 * saída lida linha a linha. O processo nasce num grupo próprio: estourar o prazo ou
 * cancelar mata o grupo inteiro, inclusive a ponte MCP que o CLI iniciou.
 */
export interface OpcoesProcesso {
  readonly caminho: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly env: Readonly<Record<string, string>>;
  readonly entrada: string;
  readonly tempoMaximoMs: number;
  readonly sinal?: AbortSignal;
  readonly aoLinha: (linha: string) => void;
}

export type MotivoFim = "normal" | "tempo" | "cancelado" | "falha_ao_iniciar";

export interface FimProcesso {
  readonly codigo: number | null;
  /** Só o fim do stderr: é onde fica a mensagem de erro. */
  readonly stderr: string;
  readonly motivo: MotivoFim;
  readonly erroAoIniciar: string | null;
}

const LIMITE_STDERR = 16 * 1024;
/** Uma linha maior que isto é lixo (ou ataque): descartada. */
const LIMITE_LINHA = 8 * 1024 * 1024;
const ESPERA_ANTES_DO_KILL_MS = 3000;

function matarGrupo(pid: number | undefined, sinal: NodeJS.Signals): void {
  if (!pid) return;
  try {
    process.kill(-pid, sinal);
  } catch {
    // o grupo já acabou
  }
}

function leitorDeLinhas(aoLinha: (linha: string) => void) {
  const decodificador = new StringDecoder("utf8");
  let resto = "";
  const entregar = (linha: string) => {
    if (linha.trim() !== "") aoLinha(linha.replace(/\r$/, ""));
  };
  return {
    receber(pedaco: Buffer) {
      resto += decodificador.write(pedaco);
      const partes = resto.split("\n");
      resto = partes.pop() ?? "";
      if (resto.length > LIMITE_LINHA) resto = "";
      for (const p of partes) entregar(p);
    },
    terminar() {
      entregar(resto + decodificador.end());
      resto = "";
    },
  };
}

export function rodarProcesso(o: OpcoesProcesso): Promise<FimProcesso> {
  const fim = (motivo: MotivoFim, extra: Partial<FimProcesso> = {}): FimProcesso => ({
    codigo: null,
    stderr: "",
    motivo,
    erroAoIniciar: null,
    ...extra,
  });
  if (o.sinal?.aborted) return Promise.resolve(fim("cancelado"));
  return new Promise((resolver) => {
    const filho = spawn(o.caminho, [...o.args], { cwd: o.cwd, env: o.env, detached: true, stdio: "pipe" });
    let motivo: MotivoFim = "normal";
    let stderr = "";
    let terminou = false;
    const linhas = leitorDeLinhas(o.aoLinha);
    const encerrar = (porque: MotivoFim) => {
      if (terminou || motivo !== "normal") return;
      motivo = porque;
      matarGrupo(filho.pid, "SIGTERM");
      setTimeout(() => matarGrupo(filho.pid, "SIGKILL"), ESPERA_ANTES_DO_KILL_MS).unref();
    };
    const relogio = setTimeout(() => encerrar("tempo"), o.tempoMaximoMs);
    const aoCancelar = () => encerrar("cancelado");
    o.sinal?.addEventListener("abort", aoCancelar, { once: true });
    const limpar = () => {
      terminou = true;
      clearTimeout(relogio);
      o.sinal?.removeEventListener("abort", aoCancelar);
    };
    filho.on("error", (e: NodeJS.ErrnoException) => {
      if (terminou) return;
      limpar();
      resolver(fim("falha_ao_iniciar", { erroAoIniciar: `${e.code ?? ""} ${e.message}`.trim() }));
    });
    filho.stdout.on("data", (pedaco: Buffer) => linhas.receber(pedaco));
    filho.stderr.on("data", (pedaco: Buffer) => {
      stderr = (stderr + pedaco.toString("utf8")).slice(-LIMITE_STDERR);
    });
    filho.stdin.on("error", () => undefined); // EPIPE: o CLI saiu antes de ler tudo
    filho.stdin.end(o.entrada);
    filho.on("close", (codigo) => {
      if (terminou) return;
      linhas.terminar();
      limpar();
      matarGrupo(filho.pid, "SIGKILL"); // netos que o CLI não esperou
      resolver(fim(motivo, { codigo, stderr }));
    });
  });
}
