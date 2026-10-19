import { describe, expect, it, vi } from "vitest";
import { criarFonteBarrasMt5Http } from "./fonte-mt5.js";

const conta = { servidor: "Clear-Demo", login: "1234567", senha: "senha-super-secreta" };
const resposta = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status });

describe("criarFonteBarrasMt5Http", () => {
  it("manda a conta no corpo (rede interna) e devolve símbolos e barras", async () => {
    const f = vi.fn(async (url: string | URL | Request) =>
      String(url).endsWith("/simbolos")
        ? resposta({ simbolos: ["WIN$N"] })
        : resposta({
            barras: [{ tempoServidorNaive: 1, abre: "1", maxima: "1", minima: "1", fecha: "1", volume: "1" }],
          }),
    );
    const fonte = criarFonteBarrasMt5Http({
      url: "http://coletor-mt5:8090/",
      conta,
      fetch: f as unknown as typeof fetch,
    });
    expect(await fonte.simbolosWin()).toEqual(["WIN$N"]);
    expect(await fonte.barras({ simbolo: "WIN$N", intervalo: "5m", de: 0, ate: 1 })).toHaveLength(1);
    const [url, init] = f.mock.calls[1] as unknown as [string, RequestInit];
    expect(url).toBe("http://coletor-mt5:8090/coletar");
    expect(JSON.parse(init.body as string)).toMatchObject({ conta, simbolo: "WIN$N" });
  });

  it("a senha nunca aparece nas mensagens de erro, nem se o coletor a repetir", async () => {
    const f = vi.fn(async () => resposta({ erro: `login falhou para ${conta.senha}` }, 502));
    const fonte = criarFonteBarrasMt5Http({
      url: "http://coletor-mt5:8090",
      conta,
      fetch: f as unknown as typeof fetch,
    });
    const erro = await fonte.simbolosWin().catch((e: Error) => e);
    expect((erro as Error).message).toMatch(/502/);
    expect((erro as Error).message).not.toContain(conta.senha);
    const caiu = vi.fn(async () => {
      throw new Error(`ECONNREFUSED ${conta.senha}`);
    });
    const f2 = criarFonteBarrasMt5Http({ url: "http://x", conta, fetch: caiu as unknown as typeof fetch });
    expect(((await f2.simbolosWin().catch((e: Error) => e)) as Error).message).not.toContain(conta.senha);
  });
});
