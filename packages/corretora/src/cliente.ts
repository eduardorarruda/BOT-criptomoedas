import type { z } from "zod";
import { assinarConsulta } from "./assinatura.js";
import { Disjuntor } from "./disjuntor.js";
import {
  ErroConfiguracao,
  ErroCorretora,
  ErroLimiteRequisicoes,
  ErroRede,
  ErroSaldoInsuficiente,
  ErroTimestamp,
} from "./erros.js";
import { RespostaErro, RespostaTempo } from "./esquemas.js";

export type Parametros = Record<string, string | number | boolean | undefined>;
export type Metodo = "GET" | "POST" | "DELETE";

export interface OpcoesCliente {
  readonly urlBase: string;
  readonly apiKey?: string | undefined;
  readonly apiSecret?: string | undefined;
  readonly fetch?: typeof fetch;
  readonly agora?: () => number;
  readonly recvWindow?: number;
  readonly timeoutMs?: number;
  readonly intervaloSincronizacaoMs?: number;
  /** Bloqueio por IP compartilhado (ver disjuntor.ts). Sem ele, o cliente tem o próprio. */
  readonly disjuntor?: Disjuntor;
}

const ESPERA_PADRAO_LIMITE_MS = 60_000;

/**
 * Cliente REST da Binance: assina (HMAC-SHA256), corrige o relógio pelo do servidor,
 * respeita o Retry-After e transforma toda falha num erro tipado. Respostas passam
 * por esquema Zod: dado de fora não entra sem validação.
 */
export class ClienteBinance {
  private readonly fetch: typeof fetch;
  private readonly agora: () => number;
  private readonly recvWindow: number;
  private readonly timeoutMs: number;
  private readonly intervaloSincronizacaoMs: number;
  private desvioRelogioMs = 0;
  private sincronizadoEm: number | null = null;
  private readonly disjuntor: Disjuntor;
  private peso: { usado: number; em: number } | null = null;

  constructor(private readonly opcoes: OpcoesCliente) {
    this.fetch = opcoes.fetch ?? globalThis.fetch;
    this.agora = opcoes.agora ?? Date.now;
    this.recvWindow = opcoes.recvWindow ?? 5_000;
    this.timeoutMs = opcoes.timeoutMs ?? 10_000;
    this.intervaloSincronizacaoMs = opcoes.intervaloSincronizacaoMs ?? 30 * 60_000;
    this.disjuntor = opcoes.disjuntor ?? new Disjuntor();
  }

  /**
   * Peso de requisições já usado neste minuto, como a Binance informou no cabeçalho
   * X-MBX-USED-WEIGHT-1M da última resposta. Null se ainda não houve resposta neste minuto.
   */
  pesoUsado(): number | null {
    if (!this.peso) return null;
    const minuto = (ms: number) => Math.floor(ms / 60_000);
    return minuto(this.peso.em) === minuto(this.agoraServidor()) ? this.peso.usado : null;
  }

  /** Horário estimado do servidor da Binance. */
  agoraServidor(): number {
    return this.agora() + this.desvioRelogioMs;
  }

  async sincronizarRelogio(): Promise<void> {
    const antes = this.agora();
    const { serverTime } = await this.requisitar("GET", "/api/v3/time", "", {}, RespostaTempo);
    const depois = this.agora();
    // Metade da ida e volta: o servidor carimbou a hora no meio do caminho.
    this.desvioRelogioMs = serverTime - Math.round((antes + depois) / 2);
    this.sincronizadoEm = depois;
  }

  publico<T>(caminho: string, params: Parametros, esquema: z.ZodType<T>): Promise<T> {
    return this.requisitar("GET", caminho, consulta(params), {}, esquema);
  }

  async assinado<T>(metodo: Metodo, caminho: string, params: Parametros, esquema: z.ZodType<T>): Promise<T> {
    const { apiKey, apiSecret } = this.opcoes;
    if (!apiKey || !apiSecret)
      throw new ErroConfiguracao(
        "Esta operação precisa da chave da API da Binance. Defina BINANCE_API_KEY e BINANCE_API_SECRET (comece pela testnet).",
      );
    if (this.precisaSincronizar()) await this.sincronizarRelogio();
    try {
      return await this.enviarAssinado(metodo, caminho, params, esquema, apiKey, apiSecret);
    } catch (erro) {
      if (!(erro instanceof ErroTimestamp)) throw erro;
      // A Binance recusou sem processar: é seguro acertar o relógio e tentar mais uma vez.
      await this.sincronizarRelogio();
      return this.enviarAssinado(metodo, caminho, params, esquema, apiKey, apiSecret);
    }
  }

  private precisaSincronizar(): boolean {
    return this.sincronizadoEm === null || this.agora() - this.sincronizadoEm > this.intervaloSincronizacaoMs;
  }

  private enviarAssinado<T>(
    metodo: Metodo,
    caminho: string,
    params: Parametros,
    esquema: z.ZodType<T>,
    apiKey: string,
    apiSecret: string,
  ): Promise<T> {
    const q = consulta({ ...params, recvWindow: this.recvWindow, timestamp: this.agoraServidor() });
    const assinada = `${q}&signature=${assinarConsulta(q, apiSecret)}`;
    return this.requisitar(metodo, caminho, assinada, { "X-MBX-APIKEY": apiKey }, esquema);
  }

  private async requisitar<T>(
    metodo: Metodo,
    caminho: string,
    q: string,
    cabecalhos: Record<string, string>,
    esquema: z.ZodType<T>,
  ): Promise<T> {
    this.verificarBloqueio();
    const url = `${this.opcoes.urlBase}${caminho}${q ? `?${q}` : ""}`;
    let resposta: Response;
    try {
      resposta = await this.fetch(url, {
        method: metodo,
        headers: cabecalhos,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (erro) {
      throw erroDeRede(erro, metodo, caminho, this.timeoutMs);
    }
    this.registrarPeso(resposta.headers);
    if (!resposta.ok) throw await this.erroDaResposta(resposta);
    return validar(await lerJson(resposta), esquema, caminho);
  }

  private registrarPeso(cabecalhos: Headers): void {
    const usado = Number(cabecalhos.get("X-MBX-USED-WEIGHT-1M"));
    if (Number.isFinite(usado) && usado > 0) this.peso = { usado, em: this.agoraServidor() };
  }

  private verificarBloqueio(): void {
    const falta = this.disjuntor.restanteMs(this.agora());
    if (falta > 0)
      throw new ErroLimiteRequisicoes(
        `Limite de requisições da Binance: aguarde ${Math.ceil(falta / 1000)} s antes de tentar de novo.`,
        falta,
        false,
      );
  }

  private async erroDaResposta(resposta: Response): Promise<ErroCorretora> {
    if (resposta.status === 429 || resposta.status === 418) {
      const segundos = Number(resposta.headers.get("Retry-After"));
      const esperaMs = Number.isFinite(segundos) && segundos > 0 ? segundos * 1000 : ESPERA_PADRAO_LIMITE_MS;
      this.disjuntor.bloquear(this.agora() + esperaMs);
      return erroDeLimite(resposta.status === 418, esperaMs);
    }
    const corpo = RespostaErro.safeParse(await lerJson(resposta).catch(() => null));
    if (!corpo.success)
      return new ErroCorretora(
        `A Binance respondeu HTTP ${resposta.status} sem detalhes. Tente de novo em instantes; se persistir, veja o status da Binance.`,
      );
    return erroDoCodigo(corpo.data.code, corpo.data.msg);
  }
}

function consulta(params: Parametros): string {
  const pares = Object.entries(params).filter(
    (p): p is [string, string | number | boolean] => p[1] !== undefined,
  );
  return new URLSearchParams(pares.map(([k, v]): [string, string] => [k, String(v)])).toString();
}

async function lerJson(resposta: Response): Promise<unknown> {
  try {
    return await resposta.json();
  } catch {
    throw new ErroCorretora(
      `A Binance respondeu HTTP ${resposta.status} com um corpo que não é JSON. Tente de novo em instantes.`,
    );
  }
}

function validar<T>(dados: unknown, esquema: z.ZodType<T>, caminho: string): T {
  const r = esquema.safeParse(dados);
  if (!r.success)
    throw new ErroCorretora(
      `A resposta da Binance em ${caminho} veio num formato inesperado (${r.error.issues[0]?.message ?? "sem detalhe"}). A API pode ter mudado: atualize o adaptador.`,
    );
  return r.data;
}

function erroDeRede(erro: unknown, metodo: Metodo, caminho: string, timeoutMs: number): ErroRede {
  const nome = erro instanceof Error ? erro.name : "";
  if (nome === "TimeoutError" || nome === "AbortError")
    return new ErroRede(
      `A Binance não respondeu ${metodo} ${caminho} em ${timeoutMs / 1000} s (tempo esgotado). Verifique a conexão.`,
    );
  const detalhe = erro instanceof Error ? erro.message : String(erro);
  return new ErroRede(
    `Falha de rede em ${metodo} ${caminho} (${detalhe}). Verifique a conexão com a internet.`,
  );
}

function erroDeLimite(banido: boolean, esperaMs: number): ErroLimiteRequisicoes {
  const s = Math.ceil(esperaMs / 1000);
  const mensagem = banido
    ? `A Binance baniu este IP por excesso de requisições (HTTP 418). Aguarde ${s} s e reduza o ritmo das chamadas.`
    : `Limite de requisições da Binance atingido (HTTP 429). Aguarde ${s} s antes de tentar de novo.`;
  return new ErroLimiteRequisicoes(mensagem, esperaMs, banido);
}

function erroDoCodigo(codigo: number, msg: string): ErroCorretora {
  if (codigo === -1021)
    return new ErroTimestamp(
      `O relógio deste computador está fora da janela aceita pela Binance (código -1021: ${msg}). Ative a sincronização automática de horário (NTP).`,
      codigo,
    );
  if (codigo === -2010)
    return new ErroSaldoInsuficiente(
      `A Binance recusou a ordem (código -2010: ${msg}). Em geral é saldo insuficiente: confira o saldo livre antes de operar.`,
      codigo,
    );
  return new ErroCorretora(`A Binance recusou a requisição (código ${codigo}: ${msg}).`, codigo);
}
