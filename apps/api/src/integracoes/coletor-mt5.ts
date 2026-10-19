import { ocultarSenhaMt5 } from "@zentrade/contratos";

/** A conta demo, em claro: só na memória, e só para falar com o coletor pela rede interna do compose. */
export interface ContaMt5Aberta {
  readonly servidor: string;
  readonly login: string;
  readonly senha: string;
}

/** Abre a sessão no coletor e devolve os símbolos WIN* da corretora. Erros saem sem a senha. */
export type TestarMt5 = (conta: ContaMt5Aberta) => Promise<string[]>;

export class ErroColetorMt5 extends Error {
  override name = "ErroColetorMt5";
}

/** O cliente de teste do coletor (`POST /simbolos`); só lê, nunca envia ordem. */
export function criarTestadorMt5(url: string, f: typeof fetch = fetch): TestarMt5 {
  const base = url.replace(/\/$/, "");
  return async (conta) => {
    const limpar = (t: string) => ocultarSenhaMt5(t, conta.senha);
    const r = await f(`${base}/simbolos`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ conta, padrao: "WIN*" }),
      signal: AbortSignal.timeout(60_000),
    }).catch((e: unknown) => {
      throw new ErroColetorMt5(limpar(`o coletor do MetaTrader 5 não respondeu: ${(e as Error).message}`));
    });
    if (!r.ok) {
      const texto = (await r.text().catch(() => "")).slice(0, 300);
      throw new ErroColetorMt5(
        limpar(`o MetaTrader 5 recusou a conexão (${r.status})${texto ? `: ${texto}` : ""}`),
      );
    }
    return ((await r.json()) as { simbolos: string[] }).simbolos;
  };
}
