import { vi } from "vitest";

/** Respostas roteadas por caminho para simular a Binance sem rede. Só para testes. */
export type Rota = (url: URL, init: RequestInit) => Response | Promise<Response>;

export const json = (corpo: unknown, status = 200, cabecalhos: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(corpo), {
    status,
    headers: { "content-type": "application/json", ...cabecalhos },
  });

export function fetchFalso(rotas: Record<string, Rota | Rota[]>) {
  const fila = new Map(Object.entries(rotas).map(([k, v]) => [k, Array.isArray(v) ? [...v] : v]));
  return vi.fn(async (entrada: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(String(entrada));
    const chave = `${init.method ?? "GET"} ${url.pathname}`;
    const rota = fila.get(chave);
    if (!rota) throw new Error(`rota não simulada: ${chave}`);
    if (!Array.isArray(rota)) return rota(url, init);
    const proxima = rota.length > 1 ? rota.shift() : rota[0];
    if (!proxima) throw new Error(`sem resposta para ${chave}`);
    return proxima(url, init);
  });
}
