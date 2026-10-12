import type { z } from "zod";
import { ERRO_RESPOSTA_INVALIDA, ERRO_SEM_CONEXAO, ErroApi, erroPorStatus } from "./erros";
import { ErroRespostaEsquema } from "./esquemas";

/**
 * Cliente HTTP da API (`/api/v1`). Toda resposta passa pelo esquema Zod: se a API
 * mudar de formato, a tela avisa em vez de mostrar dado errado. Métodos que alteram
 * levam o token CSRF no cabeçalho `X-CSRF-Token`: o `csrf` que a API devolve em
 * `POST /sessao` e `GET /sessao` (ou, na falta dele, o cookie legível `zt_csrf`).
 */
export type Metodo = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
export type Consulta = Record<string, string | number | boolean | undefined>;

export const COOKIE_CSRF = "zt_csrf";
export const CABECALHO_CSRF = "X-CSRF-Token";
const TEMPO_LIMITE_MS = 15_000;

export function lerCookieCsrf(cookies: string = document.cookie): string | null {
  const par = cookies
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${COOKIE_CSRF}=`));
  return par ? decodeURIComponent(par.slice(COOKIE_CSRF.length + 1)) : null;
}

export interface OpcoesCliente {
  readonly base?: string;
  readonly fetch?: typeof fetch;
  readonly lerCsrf?: () => string | null;
}

export interface ClienteApi {
  pedir<T>(
    metodo: Metodo,
    caminho: string,
    esquema: z.ZodType<T>,
    corpo?: unknown,
    consulta?: Consulta,
  ): Promise<T>;
  pedir(
    metodo: Metodo,
    caminho: string,
    esquema: null,
    corpo?: unknown,
    consulta?: Consulta,
  ): Promise<undefined>;
  /** Guarda o `csrf` da sessão (ou esquece, com `null`, ao sair). */
  definirCsrf?(csrf: string | null): void;
}

function montarUrl(base: string, caminho: string, consulta?: Consulta): string {
  const params = new URLSearchParams();
  for (const [chave, valor] of Object.entries(consulta ?? {})) {
    if (valor !== undefined && valor !== "") params.append(chave, String(valor));
  }
  const qs = params.toString();
  return `${base}${caminho}${qs ? `?${qs}` : ""}`;
}

function montarCabecalhos(metodo: Metodo, temCorpo: boolean, csrf: string | null): Headers {
  const h = new Headers({ Accept: "application/json" });
  if (temCorpo) h.set("Content-Type", "application/json");
  if (metodo !== "GET" && csrf) h.set(CABECALHO_CSRF, csrf);
  return h;
}

async function lerJson(r: Response): Promise<unknown> {
  const texto = await r.text();
  if (texto === "") return undefined;
  return JSON.parse(texto) as unknown;
}

async function erroDaResposta(r: Response): Promise<ErroApi> {
  try {
    const corpo = ErroRespostaEsquema.safeParse(await lerJson(r));
    if (corpo.success) return new ErroApi(corpo.data.erro.codigo, corpo.data.erro.mensagem, r.status);
  } catch {
    // corpo não é JSON: cai no erro pelo status
  }
  return erroPorStatus(r.status);
}

export function criarCliente(opcoes: OpcoesCliente = {}): ClienteApi {
  const base = opcoes.base ?? "/api/v1";
  const buscar = opcoes.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  let csrfDaSessao: string | null = null;
  const lerCsrf = opcoes.lerCsrf ?? (() => csrfDaSessao ?? lerCookieCsrf());

  async function pedir<T>(
    metodo: Metodo,
    caminho: string,
    esquema: z.ZodType<T> | null,
    corpo?: unknown,
    consulta?: Consulta,
  ): Promise<T | undefined> {
    const temCorpo = corpo !== undefined;
    let r: Response;
    try {
      r = await buscar(montarUrl(base, caminho, consulta), {
        method: metodo,
        credentials: "same-origin",
        headers: montarCabecalhos(metodo, temCorpo, lerCsrf()),
        ...(temCorpo ? { body: JSON.stringify(corpo) } : {}),
        signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
      });
    } catch {
      throw ERRO_SEM_CONEXAO();
    }
    if (!r.ok) throw await erroDaResposta(r);
    if (!esquema) return undefined;
    let dados: unknown;
    try {
      dados = await lerJson(r);
    } catch {
      throw ERRO_RESPOSTA_INVALIDA(caminho);
    }
    const lido = esquema.safeParse(dados);
    if (!lido.success) throw ERRO_RESPOSTA_INVALIDA(caminho);
    return lido.data;
  }

  return {
    pedir,
    definirCsrf: (csrf: string | null) => {
      csrfDaSessao = csrf;
    },
  } as ClienteApi;
}
