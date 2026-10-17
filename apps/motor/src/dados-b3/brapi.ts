import { MS_POR_INTERVALO } from "@zentrade/contratos";
import type { Candle } from "@zentrade/dominio";
import { z } from "zod";
import { decimalDeNumero, montarCandle } from "./candle.js";
import type { FonteCandlesB3, LoteFonte, PedidoFonte } from "./fonte.js";

/**
 * Ibovespa (^BVSP) em candles intradiários pela brapi.dev, gravado como `WIN-IBOV`.
 * `GET /api/quote/%5EBVSP?range=…&interval=…`, com o token no cabeçalho `Authorization`
 * (nunca na URL, para não ir parar em log). A brapi só aceita faixas relativas a hoje
 * (`range`), então pedimos a menor que cobre `desde` e recortamos aqui.
 *
 * Planos (outubro de 2026, veja docs/dados-b3.md): o gratuito só dá candles diários; os
 * intradiários (5m, 15m, 1h) exigem o plano Pro. Sem token, nada sai daqui.
 */
export interface OpcoesBrapi {
  readonly token?: string | undefined;
  readonly fetch?: typeof fetch;
  readonly base?: string;
  readonly agora?: () => number;
  readonly esperar?: (ms: number) => Promise<void>;
  readonly tempoLimiteMs?: number;
  readonly tentativas?: number;
}

const TICKER = "^BVSP";
const TEMPO_LIMITE_MS = 20_000;
const TENTATIVAS = 4;
const RECUO_INICIAL_MS = 1000;
const ESPERA_MAXIMA_MS = 60_000;
/** Preço do índice em pontos, com até duas casas (tira o lixo do ponto flutuante). */
const CASAS = 2;
const DIA = 86_400_000;
const TAMANHO_MENSAGEM = 200;

/** Faixas da brapi com o mínimo de dias corridos que cada uma cobre. */
const FAIXAS: readonly (readonly [string, number])[] = [
  ["1d", 1],
  ["2d", 2],
  ["5d", 5],
  ["7d", 7],
  ["1mo", 28],
  ["3mo", 89],
  ["6mo", 181],
  ["1y", 365],
  ["2y", 730],
  ["5y", 1826],
  ["10y", 3652],
];

export function faixaBrapi(desde: number, agora: number): string {
  const dias = (agora - desde) / DIA;
  return FAIXAS.find(([, minimo]) => minimo >= dias)?.[0] ?? "max";
}

const Preco = z.number().nullable().optional();

const RespostaBrapi = z.object({
  results: z
    .array(
      z.object({
        symbol: z.string(),
        historicalDataPrice: z
          .array(
            z.object({
              date: z.number().int().positive(),
              open: Preco,
              high: Preco,
              low: Preco,
              close: Preco,
              volume: Preco,
            }),
          )
          .default([]),
      }),
    )
    .min(1),
});

type PontoBrapi = z.infer<typeof RespostaBrapi>["results"][number]["historicalDataPrice"][number];

const CorpoErro = z.object({ message: z.string().optional() }).loose();

export class ErroFonte extends Error {}

function mensagemPorStatus(status: number, daBrapi: string): string {
  const detalhe = daBrapi ? ` (brapi: "${daBrapi}")` : "";
  if (status === 401) return `a brapi recusou o token; confira BRAPI_TOKEN${detalhe}`;
  if (status === 400 || status === 402 || status === 403)
    return `o plano do seu token na brapi não dá acesso a ${TICKER} nesse intervalo ou período; candles intradiários exigem o plano Pro (veja docs/dados-b3.md)${detalhe}`;
  if (status === 404) return `a brapi não encontrou ${TICKER}${detalhe}`;
  if (status === 429) return "limite de consultas da brapi atingido; tente de novo em alguns minutos";
  return `a brapi falhou (código ${status})${detalhe}`;
}

/** A mensagem de erro da brapi, curta, sem caracteres de controle e sem o token. */
async function mensagemDaBrapi(r: Response, token: string): Promise<string> {
  const lido = CorpoErro.safeParse(await r.json().catch(() => null));
  const texto = lido.success ? (lido.data.message ?? "") : "";
  return texto
    .split(token)
    .join("[oculto]")
    .replace(/[\p{Cc}]/gu, " ")
    .slice(0, TAMANHO_MENSAGEM)
    .trim();
}

/** Retry-After em segundos ou como data HTTP; no máximo 60 s. */
function esperaPedida(r: Response, agora: number): number | undefined {
  const valor = r.headers.get("retry-after");
  if (!valor) return undefined;
  const segundos = Number(valor);
  const ms = Number.isFinite(segundos) ? segundos * 1000 : Date.parse(valor) - agora;
  return Number.isFinite(ms) ? Math.min(Math.max(ms, 0), ESPERA_MAXIMA_MS) : undefined;
}

const tentarDeNovo = (status: number) => status === 429 || status >= 500;

function paraCandle(p: PontoBrapi, ms: number): Candle | null {
  const { open, high, low, close } = p;
  if (typeof open !== "number" || typeof high !== "number" || typeof low !== "number") return null;
  if (typeof close !== "number") return null;
  const lido = montarCandle(p.date * 1000, ms, {
    abre: decimalDeNumero(open, CASAS),
    maxima: decimalDeNumero(high, CASAS),
    minima: decimalDeNumero(low, CASAS),
    fecha: decimalDeNumero(close, CASAS),
    volume: decimalDeNumero(p.volume ?? 0, CASAS),
  });
  return "candle" in lido ? lido.candle : null;
}

export function criarFonteBrapi(o: OpcoesBrapi = {}): FonteCandlesB3 {
  const buscarHttp = o.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const agora = o.agora ?? Date.now;
  const esperar = o.esperar ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const base = o.base ?? "https://brapi.dev/api";
  const tentativas = o.tentativas ?? TENTATIVAS;

  async function pedir(url: string, token: string): Promise<Response> {
    for (let t = 1; ; t++) {
      const recuo = RECUO_INICIAL_MS * 2 ** (t - 1);
      let r: Response;
      try {
        r = await buscarHttp(url, {
          headers: { authorization: `Bearer ${token}`, accept: "application/json" },
          signal: AbortSignal.timeout(o.tempoLimiteMs ?? TEMPO_LIMITE_MS),
        });
      } catch {
        if (t >= tentativas)
          throw new ErroFonte(
            "não foi possível falar com a brapi (rede fora ou tempo esgotado); tente de novo",
          );
        await esperar(recuo);
        continue;
      }
      if (r.ok) return r;
      if (!tentarDeNovo(r.status) || t >= tentativas)
        throw new ErroFonte(mensagemPorStatus(r.status, await mensagemDaBrapi(r, token)));
      await esperar(esperaPedida(r, agora()) ?? recuo);
    }
  }

  async function buscar(p: PedidoFonte): Promise<LoteFonte> {
    if (!o.token)
      throw new ErroFonte(
        "defina BRAPI_TOKEN (crie em brapi.dev; candles intradiários exigem o plano Pro) para importar o Ibovespa",
      );
    const faixa = faixaBrapi(p.desde, agora());
    const url = `${base}/quote/${encodeURIComponent(TICKER)}?range=${faixa}&interval=${p.intervalo}`;
    const r = await pedir(url, o.token);
    const lido = RespostaBrapi.safeParse(await r.json().catch(() => null));
    if (!lido.success) throw new ErroFonte("a brapi respondeu num formato inesperado");
    const pontos = (lido.data.results[0]?.historicalDataPrice ?? []).filter(
      (k) => k.date * 1000 >= p.desde && k.date * 1000 < p.ate,
    );
    const ms = MS_POR_INTERVALO[p.intervalo];
    const candles = pontos.map((k) => paraCandle(k, ms)).filter((k): k is Candle => k !== null);
    return {
      candles: candles.sort((a, b) => a.abertura - b.abertura),
      ignorados: pontos.length - candles.length,
      descricao: `brapi ${TICKER} (range=${faixa}, interval=${p.intervalo})`,
    };
  }

  return { nome: "brapi", simbolo: "WIN-IBOV", buscar };
}
