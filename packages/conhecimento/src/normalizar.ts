import { createHash } from "node:crypto";

/**
 * Forma canônica do texto antes do hash e da divisão: o mesmo artigo colado com
 * quebras de linha do Windows ou espaços a mais não pode virar dois documentos.
 */
// Sequências de escape de terminal (CSI e OSC) e controles, exceto quebra de linha e tab.
// Notícia vem de fora: um texto hostil não pode apagar a tela de quem lê pela CLI.
// eslint-disable-next-line no-control-regex -- casar caracteres de controle é o objetivo
const ESCAPES_TERMINAL = /\u001b\[[0-9;?]*[ -/]*[@-~]|\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)?/g;
// eslint-disable-next-line no-control-regex -- idem
const CONTROLES = /[\u0000-\u0008\u000b-\u001f\u007f]/g;

/** Tira escapes de terminal e caracteres de controle, mantendo \n e \t. */
export const removerControles = (texto: string): string =>
  texto.replace(ESCAPES_TERMINAL, "").replace(CONTROLES, "");

export function normalizarTexto(texto: string): string {
  return removerControles(texto.normalize("NFC").replace(/\r\n?/g, "\n"))
    .split("\n")
    .map((linha) => linha.replace(/[ \t\f\v\u00a0]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export const hashConteudo = (texto: string): string =>
  createHash("sha256").update(normalizarTexto(texto)).digest("hex");

const TAMANHO_MINIMO_TERMO = 3;
const TERMOS_MAXIMOS = 32;

// O dicionário 'simple' do PostgreSQL não tira stopwords; sem esta lista "com" e
// "para" casam com quase todo trecho e bagunçam o ranking textual.
const STOPWORDS = new Set(
  (
    "que com como para por pela pelo pelas pelos uma uns umas dos das nos nas num numa não sim mais menos " +
    "qual quais quando onde quem porque por que isso isto esse essa este esta aquele aquela seu sua seus suas " +
    "ele ela eles elas nós você vocês foi ser são está estão tem têm ter há já também muito muita entre sobre " +
    "até depois antes ainda então mas nem aos às pra pro dá vai"
  ).split(" "),
);

/**
 * Consulta OU para to_tsquery('simple', …). Só letras e números entram, então nada
 * do texto do usuário vira operador do tsquery.
 */
export function termosDeBusca(consulta: string): string | null {
  const palavras =
    normalizarTexto(consulta)
      .toLowerCase()
      .match(/[\p{L}\p{N}]+/gu) ?? [];
  const uteis = [
    ...new Set(palavras.filter((p) => p.length >= TAMANHO_MINIMO_TERMO && !STOPWORDS.has(p))),
  ].slice(0, TERMOS_MAXIMOS);
  return uteis.length > 0 ? uteis.join(" | ") : null;
}
