import { ErroEmbeddings, esperarDeVerdade, type BuscarHttp, type Esperar } from "./tipos.js";

export interface PedidoHttp {
  readonly url: string;
  readonly corpo: unknown;
  readonly cabecalhos?: Readonly<Record<string, string>>;
  readonly fetch?: BuscarHttp;
  readonly esperar?: Esperar;
  readonly tentativas?: number;
  readonly esperaBaseMs?: number;
}

const ehTemporario = (status: number): boolean => status === 429 || status >= 500;

/** Retry-After em segundos, quando o serviço manda; senão espera exponencial. */
function espera(resposta: Response | null, tentativa: number, baseMs: number): number {
  const pedida = Number(resposta?.headers.get("retry-after"));
  return Number.isFinite(pedida) && pedida > 0 ? pedida * 1000 : baseMs * 2 ** tentativa;
}

async function trechoDoCorpo(resposta: Response): Promise<string> {
  const texto = await resposta.text().catch(() => "");
  return texto.slice(0, 300);
}

/**
 * POST JSON com retentativa em 429, 5xx e falha de rede. Erro do cliente (4xx) não
 * se repete: chave errada continua errada na segunda vez.
 */
export async function postarJson(p: PedidoHttp): Promise<unknown> {
  const buscar = p.fetch ?? fetch;
  const esperar = p.esperar ?? esperarDeVerdade;
  const tentativas = p.tentativas ?? 4;
  const baseMs = p.esperaBaseMs ?? 500;
  const init: RequestInit = {
    method: "POST",
    headers: { "content-type": "application/json", ...p.cabecalhos },
    body: JSON.stringify(p.corpo),
  };
  let ultimoProblema = "";
  let esperaAntes = 0;
  for (let tentativa = 0; tentativa < tentativas; tentativa++) {
    if (esperaAntes > 0) await esperar(esperaAntes);
    const resposta = await buscar(p.url, init).catch((e: unknown) => {
      ultimoProblema = `falha de rede (${e instanceof Error ? e.message : String(e)})`;
      return null;
    });
    if (resposta?.ok) return resposta.json();
    if (resposta) {
      ultimoProblema = `HTTP ${resposta.status}: ${await trechoDoCorpo(resposta)}`;
      if (!ehTemporario(resposta.status))
        throw new ErroEmbeddings(`${p.url} recusou o pedido (${ultimoProblema}).`);
    }
    esperaAntes = espera(resposta, tentativa, baseMs);
  }
  throw new ErroEmbeddings(
    `${p.url} falhou em ${tentativas} tentativas (último problema: ${ultimoProblema}). ` +
      "Confira a rede e o serviço e tente de novo.",
  );
}
