import { readFileSync } from "node:fs";
import { join } from "node:path";
import { RAIZ } from "./fluxos.js";

/** Rotas e cabeçalhos lidos de docs/contrato-api.md, para comparar com os fluxos. */
export interface Rota {
  readonly metodo: string;
  readonly caminho: string;
}

export interface Contrato {
  readonly rest: readonly Rota[];
  readonly webhooksApi: readonly Rota[];
  /** Corpo documentado de cada webhook da API, ex.: "{ fonte, titulo, url?, publicadoEm, texto }". */
  readonly corposWebhooks: Readonly<Record<string, string>>;
  readonly webhooksN8n: readonly string[];
  readonly cabecalhoAssinatura: string;
  readonly toleranciaMinutos: number;
}

const METODOS = new Set(["GET", "POST", "PATCH", "PUT", "DELETE"]);

function secao(texto: string, titulo: string): string {
  const inicio = texto.indexOf(`## ${titulo}`);
  if (inicio < 0) throw new Error(`seção "${titulo}" não encontrada em docs/contrato-api.md`);
  const fim = texto.indexOf("\n## ", inicio + 3);
  return texto.slice(inicio, fim < 0 ? undefined : fim);
}

const linhasDaTabela = (s: string): string[][] =>
  s
    .split("\n")
    .filter((l) => l.startsWith("| `"))
    .map((l) =>
      l
        .split("|")
        .slice(1, -1)
        .map((c) => c.trim()),
    );

/**
 * Interpreta a primeira coluna das tabelas: "`GET /x` · `POST /x`", "`POST /a/:id/aprovar` · `/recusar`",
 * "`GET /contas` · `POST` · `DELETE /:id`".
 */
export function rotasDaCelula(celula: string, prefixo = ""): Rota[] {
  const tokens = [...celula.matchAll(/`([^`]+)`/g)].map((m) => (m[1] as string).trim());
  const rotas: Rota[] = [];
  let metodo = "";
  let base = "";
  let ultimo = "";
  for (const token of tokens) {
    const partes = token.split(/\s+/);
    const temMetodo = METODOS.has(partes[0] ?? "");
    if (temMetodo) metodo = partes[0] as string;
    const bruto = temMetodo ? partes[1] : partes[0];
    let caminho: string;
    if (bruto === undefined)
      caminho = ultimo; // "`POST`": mesmo caminho do anterior
    else if (bruto.startsWith("/:"))
      caminho = `${base}${bruto}`; // "`DELETE /:id`": relativo à base da linha
    else if (!temMetodo)
      caminho = `${ultimo.slice(0, ultimo.lastIndexOf("/"))}${bruto}`; // "`/recusar`"
    else caminho = `${prefixo}${bruto}`;
    if (base === "") base = caminho;
    ultimo = caminho;
    rotas.push({ metodo, caminho });
  }
  return rotas;
}

export function lerContrato(): Contrato {
  const texto = readFileSync(join(RAIZ, "docs/contrato-api.md"), "utf8");
  const rest = linhasDaTabela(secao(texto, "API REST")).flatMap((c) => rotasDaCelula(c[0] ?? "", "/api/v1"));
  const tabelaWebhooks = linhasDaTabela(secao(texto, "Webhooks"));
  const webhooksApi = tabelaWebhooks.flatMap((c) => rotasDaCelula(c[0] ?? ""));
  const corposWebhooks = Object.fromEntries(
    tabelaWebhooks.map((c) => [rotasDaCelula(c[0] ?? "")[0]?.caminho ?? "", (c[1] ?? "").replace(/`/g, "")]),
  );
  const webhooksN8n = [...texto.matchAll(/\$N8N_URL(\/webhook\/[a-z0-9-]+)/g)].map((m) => m[1] as string);
  const cab = /`([A-Za-z-]+): t=<segundos>,v1=/.exec(texto);
  const prazo = /validade (\d+) min/.exec(texto);
  if (!cab || !prazo) throw new Error("cabeçalho de assinatura ou validade não encontrados no contrato");
  return {
    rest,
    webhooksApi,
    corposWebhooks,
    webhooksN8n,
    cabecalhoAssinatura: cab[1] as string,
    toleranciaMinutos: Number(prazo[1]),
  };
}

/** "/api/v1/backtests/:id" casa com "/api/v1/backtests/:param". */
export const casa = (documentada: string, usada: string): boolean => {
  const a = documentada.split("/");
  const b = usada.split("/");
  return (
    a.length === b.length && a.every((seg, i) => seg === b[i] || (seg.startsWith(":") && b[i] === ":param"))
  );
};

/** Chaves de um corpo documentado: "{ fonte, titulo, url?, publicadoEm, texto }". */
export function chavesDoCorpo(corpo: string): { obrigatorias: string[]; opcionais: string[] } {
  const chaves = corpo
    .replace(/[{}]/g, "")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
  return {
    obrigatorias: chaves.filter((c) => !c.endsWith("?")),
    opcionais: chaves.filter((c) => c.endsWith("?")).map((c) => c.slice(0, -1)),
  };
}
