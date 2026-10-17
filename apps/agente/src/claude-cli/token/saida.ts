import { TokenClaude, urlAutorizacaoClaudeValida } from "@zentrade/contratos";

/**
 * Leitura da tela do `claude setup-token` (um app de terminal: cores, cursor, redesenho).
 * Tudo aqui é defensivo: a saída é de um programa de terceiros e pode trazer o token, então
 * nada dela vai para log, erro ou navegador — só o link de autorização (conferido) e o
 * token (que vai direto para a cifra).
 */

const c = (codigo: number): string => String.fromCharCode(codigo);
const ESC = c(27);
const BEL = c(7);
/** OSC (título, hiperlink: ESC ] … BEL ou ESC \), CSI (cor, cursor: ESC [ … letra) e ESC sozinho. */
const ANSI = new RegExp(
  `${ESC}\\][^${BEL}${ESC}]*(?:${BEL}|${ESC}\\\\)|${ESC}\\[[0-9;?<=>]*[ -/]*[@-~]|${ESC}[@-Z\\\\-_]`,
  "g",
);
/** Controles que sobram (menos \n e \t); \r vira quebra de linha. */
const CONTROLES = new RegExp(`[${c(0)}-${c(8)}${c(11)}${c(12)}${c(14)}-${c(31)}${c(127)}]`, "g");

export function semControles(texto: string): string {
  return texto.replace(ANSI, "").replace(/\r\n?/g, "\n").replace(CONTROLES, "");
}

/** Termina um endereço: espaço, aspas, sinais de menor/maior ou crase. */
const URL = /https?:\/\/[^\s"'<>`]+/g;
const AUTORIZACAO = /oauth|authorize/i;

export type LinkAchado = { readonly tipo: "ok"; readonly url: string } | { readonly tipo: "fora" };

/**
 * O link de autorização, quando já chegou inteiro (algo depois dele na tela). Endereço de
 * autorização fora de https e dos domínios da Anthropic vira "fora": a conexão é abortada.
 */
export function acharLink(tela: string): LinkAchado | null {
  for (const m of tela.matchAll(URL)) {
    const fim = (m.index ?? 0) + m[0].length;
    if (fim >= tela.length) return null; // pode estar pela metade
    if (!AUTORIZACAO.test(m[0])) continue;
    return urlAutorizacaoClaudeValida(m[0]) ? { tipo: "ok", url: m[0] } : { tipo: "fora" };
  }
  return null;
}

const TOKEN = /sk-ant-oat[A-Za-z0-9]*-[A-Za-z0-9_-]{20,}/g;

/** O token que o CLI imprime no fim, já inteiro e no formato certo; null enquanto não chegou. */
export function acharToken(tela: string): string | null {
  for (const m of tela.matchAll(TOKEN)) {
    const fim = (m.index ?? 0) + m[0].length;
    if (fim >= tela.length) return null;
    const lido = TokenClaude.safeParse(m[0]);
    if (lido.success) return lido.data;
  }
  return null;
}

const RECUSA = /invalid|expired|error|failed|denied|unauthori[sz]ed|try again/i;

/** Depois do código colado: o CLI disse que não aceitou (código errado, vencido, recusa). */
export const codigoRecusado = (tela: string): boolean => RECUSA.test(tela);
