import { dec, type Valor } from "@zentrade/dominio";
import { z } from "zod";

/**
 * Cotações da B3 (FIIs) pela brapi.dev: `GET /api/quote/{ticker}` com o token no
 * cabeçalho `Authorization: Bearer` (nunca na URL, para não ir parar em log). O plano
 * gratuito aceita um ativo por pedido e atualiza a cada 30 minutos, então pedimos um
 * ticker por vez e guardamos em cache por 30 minutos. Sem BRAPI_TOKEN, nada sai daqui:
 * a pessoa informa o preço à mão.
 */
export interface CotacaoB3 {
  readonly ticker: string;
  readonly preco: Valor;
  readonly moeda: string;
  readonly em: number;
}

export interface ResultadoCotacoes {
  readonly cotacoes: CotacaoB3[];
  readonly indisponiveis: { ticker: string; motivo: string }[];
}

export interface ClienteCotacoesB3 {
  readonly configurado: boolean;
  cotar(tickers: readonly string[]): Promise<ResultadoCotacoes>;
}

export interface OpcoesCotacoesB3 {
  readonly token?: string | undefined;
  readonly fetch?: typeof fetch;
  readonly agora?: () => number;
  readonly base?: string;
  readonly validadeMs?: number;
  readonly tempoLimiteMs?: number;
}

const VALIDADE_PADRAO_MS = 30 * 60_000;
const VALIDADE_ERRO_MS = 5 * 60_000;
const TEMPO_LIMITE_MS = 8_000;
const MAXIMO_POR_CONSULTA = 20;
const TAMANHO_CACHE = 500;
const TICKER = /^[A-Z0-9]{4,12}$/;

const RespostaBrapi = z.object({
  results: z
    .array(
      z.object({
        symbol: z.string(),
        regularMarketPrice: z.number().nullable().optional(),
        currency: z.string().nullable().optional(),
        regularMarketTime: z.union([z.string(), z.number()]).nullable().optional(),
      }),
    )
    .min(1),
});

type Tentativa = { cotacao: CotacaoB3 } | { motivo: string };

const MOTIVO_POR_STATUS: Record<number, string> = {
  401: "a brapi recusou o token; confira BRAPI_TOKEN",
  403: "o token da brapi não dá acesso a este ativo",
  404: "ticker não encontrado na brapi",
  429: "limite de consultas da brapi atingido; tente mais tarde ou informe o preço à mão",
};

function instante(valor: string | number | null | undefined, padrao: number): number {
  if (typeof valor === "number") return valor < 1e12 ? valor * 1000 : valor;
  const ms = typeof valor === "string" ? Date.parse(valor) : Number.NaN;
  return Number.isNaN(ms) ? padrao : ms;
}

async function lerCotacao(r: Response, ticker: string, agora: number): Promise<Tentativa> {
  const lido = RespostaBrapi.safeParse(await r.json().catch(() => null));
  if (!lido.success) return { motivo: "a brapi respondeu num formato inesperado" };
  const [item] = lido.data.results;
  const preco = item?.regularMarketPrice;
  if (typeof preco !== "number" || !(preco > 0))
    return { motivo: "a brapi não informou preço para este ativo" };
  return {
    cotacao: {
      ticker,
      preco: dec(String(preco)),
      moeda: item?.currency ?? "BRL",
      em: instante(item?.regularMarketTime, agora),
    },
  };
}

/** Tickers que podem ir à brapi e os recusados de saída (formato estranho ou acima do teto). */
function separar(unicos: readonly string[]): { validos: string[]; resultado: ResultadoCotacoes } {
  const resultado: ResultadoCotacoes = { cotacoes: [], indisponiveis: [] };
  const validos = unicos.filter((t) => TICKER.test(t));
  for (const t of unicos.filter((x) => !TICKER.test(x))) {
    resultado.indisponiveis.push({
      ticker: t,
      motivo: "ticker inválido (use letras e números, como HGLG11)",
    });
  }
  for (const t of validos.slice(MAXIMO_POR_CONSULTA)) {
    resultado.indisponiveis.push({ ticker: t, motivo: `até ${MAXIMO_POR_CONSULTA} tickers por consulta` });
  }
  return { validos: validos.slice(0, MAXIMO_POR_CONSULTA), resultado };
}

export function criarClienteCotacoesB3(o: OpcoesCotacoesB3 = {}): ClienteCotacoesB3 {
  const buscar = o.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const agora = o.agora ?? Date.now;
  const base = o.base ?? "https://brapi.dev/api";
  const validade = o.validadeMs ?? VALIDADE_PADRAO_MS;
  const cache = new Map<string, { tentativa: Tentativa; expira: number }>();

  async function consultar(ticker: string): Promise<Tentativa> {
    let r: Response;
    try {
      r = await buscar(`${base}/quote/${ticker}`, {
        headers: { authorization: `Bearer ${o.token}`, accept: "application/json" },
        signal: AbortSignal.timeout(o.tempoLimiteMs ?? TEMPO_LIMITE_MS),
      });
    } catch {
      return { motivo: "não foi possível falar com a brapi agora; informe o preço à mão" };
    }
    if (!r.ok) return { motivo: MOTIVO_POR_STATUS[r.status] ?? `a brapi falhou (código ${r.status})` };
    return lerCotacao(r, ticker, agora());
  }

  async function obter(ticker: string): Promise<Tentativa> {
    const guardado = cache.get(ticker);
    if (guardado && guardado.expira > agora()) return guardado.tentativa;
    const tentativa = await consultar(ticker);
    const prazo = "cotacao" in tentativa ? validade : VALIDADE_ERRO_MS;
    // Teto do cache: o mais antigo sai (Map guarda a ordem de inclusão).
    if (cache.size >= TAMANHO_CACHE) cache.delete(cache.keys().next().value as string);
    cache.set(ticker, { tentativa, expira: agora() + prazo });
    return tentativa;
  }

  async function cotar(tickers: readonly string[]): Promise<ResultadoCotacoes> {
    const unicos = [...new Set(tickers.map((t) => t.trim().toUpperCase()))];
    if (!o.token) {
      const motivo = "defina BRAPI_TOKEN para cotação automática; enquanto isso, informe o preço à mão";
      return { cotacoes: [], indisponiveis: unicos.map((ticker) => ({ ticker, motivo })) };
    }
    const { validos, resultado } = separar(unicos);
    const tentativas = await Promise.all(validos.map(obter));
    tentativas.forEach((t, i) => {
      if ("cotacao" in t) resultado.cotacoes.push(t.cotacao);
      else resultado.indisponiveis.push({ ticker: validos[i] ?? "", motivo: t.motivo });
    });
    return resultado;
  }

  return { configurado: Boolean(o.token), cotar };
}
