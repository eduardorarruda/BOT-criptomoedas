import { z } from "zod";
import type { ConfigPluggy } from "./pluggy-config.js";

/**
 * Cliente HTTP da Pluggy (https://docs.pluggy.ai), sem SDK: autentica com client id
 * e secret (POST /auth → apiKey de 2 h), emite connect token para o widget (30 min)
 * e lê itens e investimentos. O segredo e a apiKey nunca saem daqui: nem para a tela,
 * nem para o log. As respostas passam por Zod com só os campos que usamos.
 */

const TEMPO_LIMITE_MS = 30_000;
/** A apiKey vale 2 h; renovamos com folga. */
const VALIDADE_API_KEY_MS = 110 * 60_000;
const PAGINA = 500;

const numero = z.number().nullable().optional();
const texto = z.string().nullable().optional();

export const ItemPluggyApi = z.object({
  id: z.string(),
  status: z.string(),
  clientUserId: texto,
  lastUpdatedAt: texto,
  consentExpiresAt: texto,
  error: z.object({ code: texto, message: texto }).nullable().optional(),
  connector: z.object({ id: z.number(), name: z.string(), imageUrl: texto }),
});
export type ItemPluggyApi = z.infer<typeof ItemPluggyApi>;

export const InvestimentoPluggyApi = z.object({
  id: z.string(),
  name: z.string().nullable().optional(),
  type: z.string(),
  subtype: texto,
  status: texto,
  balance: z.number(),
  amount: numero,
  amountOriginal: numero,
  amountProfit: numero,
  taxes: numero,
  taxes2: numero,
  rate: numero,
  rateType: texto,
  fixedAnnualRate: numero,
  issuer: texto,
  issuerCNPJ: texto,
  issueDate: texto,
  purchaseDate: texto,
  dueDate: texto,
  date: texto,
});
export type InvestimentoPluggyApi = z.infer<typeof InvestimentoPluggyApi>;

const Pagina = z.object({
  page: z.number().optional(),
  totalPages: z.number(),
  results: z.array(z.unknown()),
});

export interface ClientePluggy {
  connectToken(clientUserId: string, itemId?: string): Promise<string>;
  item(id: string): Promise<ItemPluggyApi>;
  investimentos(itemId: string): Promise<InvestimentoPluggyApi[]>;
  /** Pede ao banco dados novos. O MeuPluggy recusa ("can't be updated"): nesse caso devolve false. */
  pedirAtualizacao(itemId: string): Promise<boolean>;
}

export class ErroPluggy extends Error {
  override name = "ErroPluggy";
  constructor(
    readonly status: number,
    mensagem: string,
  ) {
    super(mensagem);
  }
}

/** Traduz a falha para uma frase que a pessoa entende (como no Fluxo). */
export function mensagemPluggy(status: number, corpo: string): string {
  if (status === 401 || status === 403) {
    return "a Pluggy recusou as credenciais da instalação; confira PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET";
  }
  if (status === 404) return "a Pluggy não encontrou esta conexão; ela pode ter sido removida lá";
  if (status === 429) return "a Pluggy pediu para esperar um pouco antes de tentar de novo";
  const detalhe = /"message"\s*:\s*"([^"]{1,200})"/.exec(corpo)?.[1];
  return `a Pluggy respondeu ${status}${detalhe ? `: ${detalhe}` : ""}`;
}

function lerJson(texto: string): unknown {
  if (texto === "") return {};
  try {
    return JSON.parse(texto);
  } catch {
    return null;
  }
}

const NAO_ACEITA_ATUALIZACAO = /can'?t be updated|cannot be updated/i;

export interface OpcoesClientePluggy {
  readonly config: ConfigPluggy;
  readonly fetch?: typeof fetch;
  readonly agora?: () => number;
}

export function criarClientePluggy(o: OpcoesClientePluggy): ClientePluggy {
  const buscar = o.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const agora = o.agora ?? Date.now;
  let chave: { valor: string; expira: number } | null = null;

  async function chamar(caminho: string, init: RequestInit): Promise<Response> {
    try {
      return await buscar(`${o.config.url}${caminho}`, {
        ...init,
        signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
      });
    } catch {
      throw new ErroPluggy(0, "sem conexão com a Pluggy; confira a internet do servidor e tente de novo");
    }
  }

  async function apiKey(): Promise<string> {
    if (chave && chave.expira > agora()) return chave.valor;
    const r = await chamar("/auth", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ clientId: o.config.clientId, clientSecret: o.config.clientSecret }),
    });
    if (!r.ok) throw new ErroPluggy(r.status, mensagemPluggy(r.status, await r.text().catch(() => "")));
    const lido = z.object({ apiKey: z.string().min(1) }).safeParse(await r.json().catch(() => null));
    if (!lido.success) throw new ErroPluggy(502, "a Pluggy respondeu a autenticação num formato inesperado");
    chave = { valor: lido.data.apiKey, expira: agora() + VALIDADE_API_KEY_MS };
    return chave.valor;
  }

  async function pedir<T>(
    metodo: string,
    caminho: string,
    esquema: z.ZodType<T>,
    corpo?: unknown,
  ): Promise<T> {
    for (let tentativa = 0; ; tentativa++) {
      const r = await chamar(caminho, {
        method: metodo,
        headers: {
          "x-api-key": await apiKey(),
          accept: "application/json",
          "content-type": "application/json",
        },
        ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
      });
      // apiKey vencida antes da hora: renova uma vez.
      if (r.status === 401 && tentativa === 0) {
        chave = null;
        continue;
      }
      const textoResposta = await r.text().catch(() => "");
      if (!r.ok) throw new ErroPluggy(r.status, mensagemPluggy(r.status, textoResposta));
      const lido = esquema.safeParse(lerJson(textoResposta));
      if (!lido.success)
        throw new ErroPluggy(502, `a Pluggy respondeu ${caminho.split("?")[0]} num formato inesperado`);
      return lido.data;
    }
  }

  return {
    async connectToken(clientUserId, itemId) {
      const corpo = { ...(itemId ? { itemId } : {}), options: { clientUserId, avoidDuplicates: true } };
      return (await pedir("POST", "/connect_token", z.object({ accessToken: z.string().min(1) }), corpo))
        .accessToken;
    },
    item: (id) => pedir("GET", `/items/${encodeURIComponent(id)}`, ItemPluggyApi),
    async investimentos(itemId) {
      const resultados: InvestimentoPluggyApi[] = [];
      for (let pagina = 1, total = 1; pagina <= total; pagina++) {
        const q = `/investments?itemId=${encodeURIComponent(itemId)}&pageSize=${PAGINA}&page=${pagina}`;
        const p = await pedir("GET", q, Pagina);
        total = p.totalPages;
        for (const bruto of p.results) {
          const inv = InvestimentoPluggyApi.safeParse(bruto);
          if (inv.success) resultados.push(inv.data);
        }
      }
      return resultados;
    },
    async pedirAtualizacao(itemId) {
      try {
        await pedir("PATCH", `/items/${encodeURIComponent(itemId)}`, z.unknown(), {});
        return true;
      } catch (e) {
        if (e instanceof ErroPluggy && NAO_ACEITA_ATUALIZACAO.test(e.message)) return false;
        throw e;
      }
    },
  };
}
