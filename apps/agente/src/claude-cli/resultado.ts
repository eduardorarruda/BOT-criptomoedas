import { z } from "zod";
import type { FimProcesso } from "./processo.js";

/**
 * Leitura defensiva da saída do Claude Code: é JSON de um programa de terceiros, que
 * muda de versão para versão. Campo que não veio ou veio com outro tipo vira ausente.
 */
export const ResultadoCliEsquema = z
  .object({
    type: z.literal("result"),
    subtype: z.string().catch("desconhecido"),
    is_error: z.boolean().catch(false).optional(),
    result: z.string().catch("").optional(),
    structured_output: z.unknown().optional(),
    total_cost_usd: z.number().nonnegative().catch(0).optional(),
    num_turns: z.number().catch(0).optional(),
  })
  .loose();
export type ResultadoCli = z.infer<typeof ResultadoCliEsquema>;

/** Uma linha (ou a saída inteira) como objeto JSON, ou null. */
export function lerJson(texto: string): Record<string, unknown> | null {
  const limpo = texto.trim();
  if (!limpo.startsWith("{")) return null;
  try {
    const valor: unknown = JSON.parse(limpo);
    return valor !== null && typeof valor === "object" && !Array.isArray(valor)
      ? (valor as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** O objeto "result" do fim da execução (saída `json`, ou a última linha do `stream-json`). */
export function lerResultado(linhas: readonly string[]): ResultadoCli | null {
  for (const candidato of [linhas.join("\n"), ...[...linhas].reverse()]) {
    const lido = ResultadoCliEsquema.safeParse(lerJson(candidato));
    if (lido.success) return lido.data;
  }
  return null;
}

const AUTENTICACAO =
  /\b(log ?in|logged|not authenticated|authenticat\w*|unauthori[sz]ed|oauth|credential\w*|token expired|invalid api key)\b/i;
const LIMITE = /\b(rate.?limit\w*|usage limit|quota|too many requests|429|limit reached)\b/i;

export type CodigoFalhaCli = "autenticacao" | "limite" | "nao_encontrado" | "tempo" | "falhou";

export interface FalhaCli {
  readonly codigo: CodigoFalhaCli;
  readonly mensagem: string;
}

const semCores = (t: string): string =>
  t.replace(new RegExp(String.fromCharCode(27) + "\\[[0-9;?]*[A-Za-z]", "g"), "");

function ultimaLinha(stderr: string): string {
  const linhas = semCores(stderr)
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "");
  const ultima = linhas.at(-1) ?? "";
  return ultima.length > 300 ? `${ultima.slice(0, 299)}…` : ultima;
}

/** Explica, para a pessoa, por que o CLI não entregou resposta. `null` = não houve falha do processo. */
export function explicarFalha(
  fim: FimProcesso,
  tempoMs: number,
  resultado: ResultadoCli | null,
): FalhaCli | null {
  if (fim.motivo === "falha_ao_iniciar") {
    return {
      codigo: "nao_encontrado",
      mensagem: `Não consegui iniciar o Claude Code (${fim.erroAoIniciar ?? "erro desconhecido"}). Confira se o CLI está instalado no servidor do agente (AGENTE_CLAUDE_CAMINHO).`,
    };
  }
  if (fim.motivo === "tempo") {
    return {
      codigo: "tempo",
      mensagem: `O Claude Code passou de ${Math.round(tempoMs / 1000)} s e foi interrompido.`,
    };
  }
  if (fim.motivo === "cancelado" || (fim.codigo === 0 && resultado)) return null;
  const texto = `${resultado?.result ?? ""}\n${fim.stderr}`;
  if (LIMITE.test(texto)) {
    return {
      codigo: "limite",
      mensagem: "O limite de uso do plano do Claude acabou por agora. Tente mais tarde.",
    };
  }
  if (AUTENTICACAO.test(texto)) {
    return {
      codigo: "autenticacao",
      mensagem:
        "O Claude Code desta conta não está logado (ou o login expirou). Faça o login de novo (veja docs/operacao.md).",
    };
  }
  const detalhe = ultimaLinha(fim.stderr) || ultimaLinha(resultado?.result ?? "");
  return {
    codigo: "falhou",
    mensagem: `O Claude Code terminou com erro (código ${fim.codigo ?? "?"})${detalhe ? `: ${detalhe}` : "."}`,
  };
}
