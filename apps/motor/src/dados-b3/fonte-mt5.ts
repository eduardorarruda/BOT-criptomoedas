import { ocultarSenhaMt5 } from "@zentrade/contratos";

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
  /**
   * Em ms UTC. O coletor não sabe o fuso do servidor: pede ao MT5 dias inteiros com uma
   * folga de um dia para cada lado, e o motor recorta depois de converter para UTC.
   */
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

/** A conta demo, em claro: só existe na memória de quem chama o coletor (rede do compose). */
export interface ContaMt5 {
  readonly servidor: string;
  readonly login: string;
  readonly senha: string;
}

export interface OpcoesFonteBarrasMt5Http {
  /** Ex.: http://coletor-mt5:8090 (nome do serviço no compose; sem porta no host). */
  readonly url: string;
  readonly conta: ContaMt5;
  readonly fetch?: typeof fetch;
}

async function pedir<T>(url: string, corpo: unknown, conta: ContaMt5, f: typeof fetch): Promise<T> {
  // Nenhuma mensagem de erro pode carregar a senha (nem o que o coletor devolver).
  const limpar = (t: string) => ocultarSenhaMt5(t, conta.senha);
  const r = await f(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ conta, ...(corpo as object) }),
  }).catch((erro: unknown) => {
    throw new Error(limpar(`coletor-mt5 não respondeu em ${url}: ${(erro as Error).message}`));
  });
  if (!r.ok) {
    const texto = await r.text().catch(() => "");
    throw new Error(
      limpar(`coletor-mt5 devolveu ${r.status} em ${url}${texto ? `: ${texto.slice(0, 300)}` : ""}`),
    );
  }
  return (await r.json()) as T;
}

/** A implementação real: fala HTTP com o `coletor-mt5` (porta interna do compose). */
export function criarFonteBarrasMt5Http(o: OpcoesFonteBarrasMt5Http): FonteBarrasMt5 {
  const f = o.fetch ?? fetch;
  const base = o.url.replace(/\/$/, "");
  return {
    simbolosWin: async () =>
      (await pedir<{ simbolos: string[] }>(`${base}/simbolos`, { padrao: "WIN*" }, o.conta, f)).simbolos,
    barras: async (p) => (await pedir<{ barras: BarraMt5[] }>(`${base}/coletar`, p, o.conta, f)).barras,
  };
}
