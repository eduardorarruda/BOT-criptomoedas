import {
  BacktestEsquema,
  DecisaoDetalheEsquema,
  DecisaoEsquema,
  ErroRespostaEsquema,
  ParadaTotalEsquema,
  PedidoBacktestEsquema,
  ResumoEsquema,
  type BacktestDTO,
  type DecisaoDetalhe,
  type PedidoBacktestDTO,
  type Resumo,
} from "@zentrade/contratos";
import { z } from "zod";

/** Os formatos vêm de @zentrade/contratos: a CLI e o MCP leem exatamente o que a API devolve. */
export { BacktestEsquema, DecisaoDetalheEsquema, ResumoEsquema };
export const NovoBacktestEsquema = PedidoBacktestEsquema;
export type Backtest = BacktestDTO;
export type NovoBacktest = PedidoBacktestDTO;
export type { DecisaoDetalhe, Resumo };

export class ErroApi extends Error {
  override name = "ErroApi";
  constructor(
    readonly status: number,
    readonly codigo: string,
    mensagem: string,
  ) {
    super(mensagem);
  }
}

export interface ConfigApi {
  readonly url: string;
  readonly token: string;
}

const AmbienteApi = z.object({
  ZENTRADE_API_URL: z
    .url("ZENTRADE_API_URL precisa ser uma URL, ex.: http://localhost:8080")
    .default("http://localhost:8080"),
  ZENTRADE_TOKEN: z.string("defina ZENTRADE_TOKEN com um token criado na tela (Tokens)").min(1),
});

export function configDaApi(env: Readonly<Record<string, string | undefined>>): ConfigApi {
  const lido = AmbienteApi.safeParse(env);
  if (!lido.success) {
    const problemas = lido.error.issues.map((i) => `${String(i.path[0])}: ${i.message}`).join("; ");
    throw new ErroApi(0, "configuracao", `Configuração da API inválida — ${problemas}.`);
  }
  return { url: lido.data.ZENTRADE_API_URL, token: lido.data.ZENTRADE_TOKEN };
}

type Buscar = (url: string, init: RequestInit) => Promise<Response>;

/** Cliente da API REST do ZenTrade (/api/v1) com token Bearer, usado pela CLI e pelo MCP. */
export class ClienteApi {
  readonly #base: string;
  readonly #token: string;
  readonly #fetch: Buscar;

  constructor(o: ConfigApi & { readonly fetch?: Buscar }) {
    this.#base = `${o.url.replace(/\/+$/, "")}/api/v1`;
    this.#token = o.token;
    this.#fetch = o.fetch ?? fetch;
  }

  resumo(): Promise<Resumo> {
    return this.#pedir("GET", "/resumo", ResumoEsquema);
  }

  decisoes(f: { roboId?: string; limite?: number } = {}): Promise<z.infer<typeof DecisaoEsquema>[]> {
    const consulta = new URLSearchParams();
    if (f.roboId) consulta.set("roboId", f.roboId);
    if (f.limite) consulta.set("limite", String(f.limite));
    const sufixo = consulta.size > 0 ? `?${consulta}` : "";
    return this.#pedir("GET", `/decisoes${sufixo}`, z.array(DecisaoEsquema));
  }

  decisao(id: string): Promise<DecisaoDetalhe> {
    return this.#pedir("GET", `/decisoes/${encodeURIComponent(id)}`, DecisaoDetalheEsquema);
  }

  paradaTotal(ligada: boolean): Promise<{ ligada: boolean }> {
    return this.#pedir("POST", "/parada-total", ParadaTotalEsquema, { ligada });
  }

  criarBacktest(b: NovoBacktest): Promise<Backtest> {
    return this.#pedir("POST", "/backtests", BacktestEsquema, NovoBacktestEsquema.parse(b));
  }

  backtest(id: string): Promise<Backtest> {
    return this.#pedir("GET", `/backtests/${encodeURIComponent(id)}`, BacktestEsquema);
  }

  async #pedir<T>(metodo: string, caminho: string, esquema: z.ZodType<T>, corpo?: unknown): Promise<T> {
    const url = `${this.#base}${caminho}`;
    const r = await this.#fetch(url, {
      method: metodo,
      headers: {
        authorization: `Bearer ${this.#token}`,
        ...(corpo === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
      signal: AbortSignal.timeout(15_000),
    }).catch((e: unknown) => {
      const causa = e instanceof Error ? e.message : String(e);
      throw new ErroApi(
        0,
        "sem_conexao",
        `Não consegui falar com a API em ${this.#base} (${causa}). Confira ZENTRADE_API_URL.`,
      );
    });
    const json: unknown = await r.json().catch(() => null);
    if (!r.ok) throw this.#erro(r.status, json);
    const lido = esquema.safeParse(json);
    if (!lido.success) {
      throw new ErroApi(
        r.status,
        "resposta_invalida",
        `A API respondeu fora do formato esperado em ${caminho}: ${lido.error.message}`,
      );
    }
    return lido.data;
  }

  #erro(status: number, json: unknown): ErroApi {
    const e = ErroRespostaEsquema.safeParse(json);
    const codigo = e.success ? e.data.erro.codigo : `http_${status}`;
    const mensagem = e.success ? e.data.erro.mensagem : `A API respondeu ${status}.`;
    const dica = status === 401 ? " Confira o ZENTRADE_TOKEN (crie um novo na tela, em Tokens)." : "";
    return new ErroApi(status, codigo, `${mensagem}${dica}`);
  }
}
