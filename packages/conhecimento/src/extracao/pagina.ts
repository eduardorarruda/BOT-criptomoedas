import http, { type IncomingMessage } from "node:http";
import https from "node:https";
import { conferirHostLiteral, enderecoPublico, lookupSeguro, type PermitirEndereco } from "./rede.js";
import { ErroExtracao, type TipoExtraivel } from "./tipos.js";

export interface OpcoesBaixarPagina {
  /** Teto do corpo baixado (padrão 5 MB). */
  readonly limiteBytes?: number;
  /** Prazo total, do primeiro byte enviado ao último recebido (padrão 15 s). */
  readonly tempoMs?: number;
  readonly maxRedirecionamentos?: number;
  /** Só para testes: o padrão aceita apenas endereço público (defesa contra SSRF). */
  readonly permitirEndereco?: PermitirEndereco;
}

export interface PaginaBaixada {
  /** Endereço final, depois dos redirecionamentos. */
  readonly url: string;
  readonly tipo: TipoExtraivel;
  readonly bytes: Buffer;
}

const LIMITE_PADRAO = 5 * 1024 * 1024;
const TEMPO_PADRAO_MS = 15_000;
const REDIRECIONAMENTOS = new Set([301, 302, 303, 307, 308]);
const TIPOS_CONTEUDO: Readonly<Record<string, TipoExtraivel>> = {
  "text/html": "html",
  "application/xhtml+xml": "html",
  "text/plain": "txt",
  "text/markdown": "md",
  "application/pdf": "pdf",
};

/** Só http/https, sem usuário e senha na URL e sem IP interno escrito direto. */
export function validarUrl(bruta: string, permitir: PermitirEndereco = enderecoPublico): URL {
  let url: URL;
  try {
    url = new URL(bruta);
  } catch {
    throw new ErroExtracao("Endereço inválido. Use um link completo, começando com https://.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ErroExtracao("Só links http:// ou https:// são aceitos.");
  }
  if (url.username || url.password) throw new ErroExtracao("Links com usuário e senha não são aceitos.");
  conferirHostLiteral(url.hostname, permitir);
  return url;
}

function pedir(url: URL, permitir: PermitirEndereco, signal: AbortSignal): Promise<IncomingMessage> {
  const modulo = url.protocol === "https:" ? https : http;
  return new Promise((ok, falhar) => {
    const req = modulo.request(url, {
      method: "GET",
      agent: false,
      signal,
      lookup: lookupSeguro(permitir) as never,
      headers: {
        "user-agent": "ZenTrade/0.1 (base de conhecimento)",
        accept: "text/html,application/xhtml+xml,text/plain,text/markdown,application/pdf;q=0.9",
      },
    });
    req.on("response", ok);
    req.on("error", falhar);
    req.end();
  });
}

async function lerCorpo(resposta: IncomingMessage, limite: number): Promise<Buffer> {
  const declarado = Number(resposta.headers["content-length"] ?? 0);
  const grande = () => new ErroExtracao(`A página passa de ${Math.round(limite / 1024 / 1024)} MB.`);
  if (declarado > limite) {
    resposta.destroy();
    throw grande();
  }
  const partes: Buffer[] = [];
  let total = 0;
  for await (const parte of resposta as AsyncIterable<Buffer>) {
    total += parte.length;
    if (total > limite) {
      resposta.destroy();
      throw grande();
    }
    partes.push(parte);
  }
  return Buffer.concat(partes);
}

function tipoDa(resposta: IncomingMessage): TipoExtraivel {
  const [semParametros = ""] = String(resposta.headers["content-type"] ?? "").split(";");
  const bruto = semParametros.trim().toLowerCase();
  const tipo = TIPOS_CONTEUDO[bruto];
  if (!tipo) {
    throw new ErroExtracao(
      `O link devolveu "${bruto || "sem tipo"}"; só páginas HTML, texto e PDF são aceitos.`,
    );
  }
  return tipo;
}

function traduzir(e: unknown): unknown {
  if (e instanceof ErroExtracao) return e;
  if (e instanceof Error && (e.name === "AbortError" || e.name === "TimeoutError")) {
    return new ErroExtracao("A página demorou demais para responder.");
  }
  const codigo = (e as { code?: unknown }).code;
  return new ErroExtracao(
    codigo === "ENOTFOUND" ? "Não achei esse endereço (o domínio existe?)." : "Não consegui baixar a página.",
    { cause: e },
  );
}

async function seguir(
  url: URL,
  o: Required<OpcoesBaixarPagina>,
  signal: AbortSignal,
): Promise<PaginaBaixada> {
  let atual = url;
  for (let saltos = 0; ; saltos++) {
    const resposta = await pedir(atual, o.permitirEndereco, signal);
    const status = resposta.statusCode ?? 0;
    if (REDIRECIONAMENTOS.has(status) && resposta.headers.location) {
      resposta.resume();
      if (saltos >= o.maxRedirecionamentos) throw new ErroExtracao("A página redirecionou vezes demais.");
      atual = validarUrl(new URL(resposta.headers.location, atual).toString(), o.permitirEndereco);
      continue;
    }
    if (status !== 200) {
      resposta.resume();
      throw new ErroExtracao(`A página respondeu com o código ${status}.`);
    }
    const tipo = tipoDa(resposta);
    return { url: atual.toString(), tipo, bytes: await lerCorpo(resposta, o.limiteBytes) };
  }
}

/**
 * Baixa um link para a base de conhecimento, com defesa contra SSRF: só http/https,
 * cada salto de redirecionamento é conferido de novo, o DNS é resolvido e conferido
 * antes de conectar (e a conexão usa o IP conferido), com prazo e tamanho máximos.
 */
export async function baixarPagina(bruta: string, opcoes: OpcoesBaixarPagina = {}): Promise<PaginaBaixada> {
  const o: Required<OpcoesBaixarPagina> = {
    limiteBytes: opcoes.limiteBytes ?? LIMITE_PADRAO,
    tempoMs: opcoes.tempoMs ?? TEMPO_PADRAO_MS,
    maxRedirecionamentos: opcoes.maxRedirecionamentos ?? 3,
    permitirEndereco: opcoes.permitirEndereco ?? enderecoPublico,
  };
  const url = validarUrl(bruta, o.permitirEndereco);
  try {
    return await seguir(url, o, AbortSignal.timeout(o.tempoMs));
  } catch (e) {
    throw traduzir(e);
  }
}
