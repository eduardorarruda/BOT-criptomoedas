import { describe, expect, it, vi } from "vitest";
import { postarJson } from "./http.js";
import { ErroEmbeddings } from "./tipos.js";

const resposta = (status: number, corpo: unknown, cabecalhos: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(corpo), {
    status,
    headers: { "content-type": "application/json", ...cabecalhos },
  });

async function falha(p: Promise<unknown>): Promise<Error> {
  return p.then(
    () => {
      throw new Error("era para falhar");
    },
    (e: unknown) => e as Error,
  );
}

const base = { url: "https://x.test/v1", corpo: { a: 1 }, cabecalhos: { authorization: "Bearer k" } };

describe("postarJson", () => {
  it("envia JSON com os cabeçalhos e devolve o corpo da resposta", async () => {
    const fetch = vi.fn().mockResolvedValue(resposta(200, { ok: true }));
    const esperar = vi.fn();
    await expect(postarJson({ ...base, fetch, esperar })).resolves.toEqual({ ok: true });
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe(base.url);
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ "content-type": "application/json", authorization: "Bearer k" });
    expect(JSON.parse(init.body)).toEqual({ a: 1 });
    expect(esperar).not.toHaveBeenCalled();
  });

  it("tenta de novo em 429 e 5xx, respeitando o Retry-After", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(resposta(429, {}, { "retry-after": "2" }))
      .mockResolvedValueOnce(resposta(503, {}))
      .mockResolvedValueOnce(resposta(200, { ok: 1 }));
    const esperar = vi.fn().mockResolvedValue(undefined);
    await expect(postarJson({ ...base, fetch, esperar, esperaBaseMs: 100 })).resolves.toEqual({ ok: 1 });
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(esperar.mock.calls.map((c) => c[0])).toEqual([2000, 200]);
  });

  it("cada tentativa tem prazo: host que não responde vira falha de rede", async () => {
    const fetch = vi.fn(
      (_u: string, init: RequestInit) =>
        new Promise<Response>((_, rejeitar) =>
          init.signal?.addEventListener("abort", () => rejeitar(new Error("tempo esgotado"))),
        ),
    );
    const erro = await falha(postarJson({ ...base, fetch, esperar: vi.fn(), tentativas: 2, limiteMs: 10 }));
    expect(erro.message).toMatch(/tempo esgotado/);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("tenta de novo quando a rede falha", async () => {
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValue(resposta(200, 1));
    await expect(postarJson({ ...base, fetch, esperar: async () => {} })).resolves.toBe(1);
  });

  it("desiste depois do número máximo de tentativas com erro claro", async () => {
    const fetch = vi.fn().mockResolvedValue(resposta(500, { erro: "caiu" }));
    const erro = await falha(postarJson({ ...base, fetch, esperar: async () => {}, tentativas: 3 }));
    expect(erro).toBeInstanceOf(ErroEmbeddings);
    expect(erro.message).toMatch(/3 tentativas.*500/s);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("não insiste em erro do cliente (4xx) e mostra o que o serviço respondeu", async () => {
    const fetch = vi.fn().mockResolvedValue(resposta(401, { detail: "chave inválida" }));
    const erro = await falha(postarJson({ ...base, fetch, esperar: async () => {} }));
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(erro.message).toMatch(/401/);
    expect(erro.message).toMatch(/chave inválida/);
  });

  it("explica quando a rede falha em todas as tentativas", async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    const erro = await falha(postarJson({ ...base, fetch, esperar: async () => {}, tentativas: 2 }));
    expect(erro.message).toMatch(/fetch failed/);
    expect(erro.message).toMatch(/x\.test/);
  });
});
