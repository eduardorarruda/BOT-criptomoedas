/**
 * Porta para o `coletor-mt5` (container Wine + MT5 + mt5linux, perfil `mt5` do
 * compose; veja `docs/adr/009-mt5-wine-docker.md`). O motor nunca fala com o MT5
 * direto: chama essa API HTTP interna, só na rede do compose, sem porta publicada.
 * O horário das barras vem "do servidor" (sem fuso aplicado ainda); quem converte
 * para UTC é `paraUtcMt5` (fuso-mt5.ts), com o fuso configurado ou detectado.
 */
export interface PedidoBarrasMt5 {
  readonly simbolo: string;
  readonly intervalo: "5m";
  /** Em ms UTC: o coletor converte para o fuso do servidor antes de pedir ao MT5. */
  readonly de: number;
  readonly ate: number;
}

export interface BarraMt5 {
  /** Hora do servidor, lida como se fosse UTC (ver fuso-mt5.ts). */
  readonly tempoServidorNaive: number;
  readonly abre: string;
  readonly maxima: string;
  readonly minima: string;
  readonly fecha: string;
  readonly volume: string;
}

export interface FonteBarrasMt5 {
  /** Os símbolos que casam com `WIN*` nesta corretora (para achar o contínuo). */
  simbolosWin(): Promise<string[]>;
  barras(p: PedidoBarrasMt5): Promise<BarraMt5[]>;
}

export interface OpcoesFonteBarrasMt5Http {
  /** Ex.: http://coletor-mt5:8090 (nome do serviço no compose; sem porta no host). */
  readonly url: string;
  readonly fetch?: typeof fetch;
}

async function pedir<T>(url: string, opcoes: RequestInit, f: typeof fetch): Promise<T> {
  const r = await f(url, opcoes).catch((erro: unknown) => {
    throw new Error(`coletor-mt5 não respondeu em ${url}: ${(erro as Error).message}`, { cause: erro });
  });
  if (!r.ok) {
    const corpo = await r.text().catch(() => "");
    throw new Error(`coletor-mt5 devolveu ${r.status} em ${url}${corpo ? `: ${corpo}` : ""}`);
  }
  return (await r.json()) as T;
}

/** A implementação real: fala HTTP com o `coletor-mt5` (porta interna do compose). */
export function criarFonteBarrasMt5Http(o: OpcoesFonteBarrasMt5Http): FonteBarrasMt5 {
  const f = o.fetch ?? fetch;
  const base = o.url.replace(/\/$/, "");
  return {
    simbolosWin: () => pedir<string[]>(`${base}/simbolos?padrao=WIN*`, { method: "GET" }, f),
    barras: (p) =>
      pedir<BarraMt5[]>(
        `${base}/coletar`,
        { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(p) },
        f,
      ),
  };
}
