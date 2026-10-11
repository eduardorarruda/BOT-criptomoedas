import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { CABECALHO_CSRF, criarCliente, lerCookieCsrf } from "./cliente";
import { ErroApi } from "./erros";

const Esquema = z.object({ ligada: z.boolean() });

function resposta(status: number, corpo?: unknown): Response {
  return new Response(corpo === undefined ? null : JSON.stringify(corpo), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function preparar(r: Response | Error, csrf: string | null = "tok-123") {
  const fetchFalso = vi.fn<typeof fetch>(async () => {
    if (r instanceof Error) throw r;
    return r;
  });
  const cliente = criarCliente({ base: "/api/v1", fetch: fetchFalso, lerCsrf: () => csrf });
  return { cliente, fetchFalso };
}

describe("cliente da API", () => {
  it("devolve a resposta validada pelo esquema", async () => {
    const { cliente, fetchFalso } = preparar(resposta(200, { ligada: true }));
    await expect(cliente.pedir("GET", "/parada-total", Esquema)).resolves.toEqual({ ligada: true });
    const [url, init] = fetchFalso.mock.calls[0]!;
    expect(url).toBe("/api/v1/parada-total");
    expect(init?.credentials).toBe("same-origin");
  });

  it("recusa resposta fora do formato, com mensagem que explica", async () => {
    const { cliente } = preparar(resposta(200, { ligada: "sim" }));
    const erro = await cliente.pedir("GET", "/parada-total", Esquema).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ErroApi);
    expect((erro as ErroApi).codigo).toBe("resposta_invalida");
    expect((erro as ErroApi).mensagem).toMatch(/formato/);
  });

  it("manda o token CSRF e o corpo JSON nos métodos que alteram", async () => {
    const { cliente, fetchFalso } = preparar(resposta(200, { ligada: true }));
    await cliente.pedir("POST", "/parada-total", Esquema, { ligada: true });
    const init = fetchFalso.mock.calls[0]![1]!;
    const cabecalhos = new Headers(init.headers);
    expect(cabecalhos.get(CABECALHO_CSRF)).toBe("tok-123");
    expect(cabecalhos.get("Content-Type")).toBe("application/json");
    expect(init.body).toBe(JSON.stringify({ ligada: true }));
  });

  it("não manda CSRF em leitura", async () => {
    const { cliente, fetchFalso } = preparar(resposta(200, { ligada: false }));
    await cliente.pedir("GET", "/x", Esquema);
    expect(new Headers(fetchFalso.mock.calls[0]![1]!.headers).has(CABECALHO_CSRF)).toBe(false);
  });

  it("aceita 204 sem corpo quando não há esquema", async () => {
    const { cliente } = preparar(resposta(204));
    await expect(cliente.pedir("DELETE", "/sessao", null)).resolves.toBeUndefined();
  });

  it("usa o código e a mensagem que a API mandou", async () => {
    const { cliente } = preparar(
      resposta(403, { erro: { codigo: "reautenticacao_necessaria", mensagem: "Confirme sua senha." } }),
    );
    await expect(cliente.pedir("POST", "/parada-total", Esquema, { ligada: false })).rejects.toMatchObject({
      codigo: "reautenticacao_necessaria",
      mensagem: "Confirme sua senha.",
      status: 403,
    });
  });

  it("explica o erro pelo status quando a API não mandou corpo", async () => {
    const { cliente } = preparar(resposta(401));
    await expect(cliente.pedir("GET", "/resumo", Esquema)).rejects.toMatchObject({
      codigo: "nao_autenticado",
    });
  });

  it("explica erro de servidor com o código", async () => {
    const { cliente } = preparar(new Response("<html>", { status: 502 }));
    await expect(cliente.pedir("GET", "/resumo", Esquema)).rejects.toMatchObject({
      codigo: "erro_servidor",
      status: 502,
    });
  });

  it("transforma falha de rede em erro com ação", async () => {
    const { cliente } = preparar(new TypeError("Failed to fetch"));
    await expect(cliente.pedir("GET", "/resumo", Esquema)).rejects.toMatchObject({ codigo: "sem_conexao" });
  });

  it("recusa JSON quebrado em resposta de sucesso", async () => {
    const { cliente } = preparar(new Response("{quebrado", { status: 200 }));
    await expect(cliente.pedir("GET", "/resumo", Esquema)).rejects.toMatchObject({
      codigo: "resposta_invalida",
    });
  });

  it("monta a consulta sem valores vazios", async () => {
    const { cliente, fetchFalso } = preparar(resposta(200, { ligada: true }));
    await cliente.pedir("GET", "/decisoes", Esquema, undefined, {
      estado: "barrada",
      roboId: undefined,
      limite: 50,
    });
    expect(fetchFalso.mock.calls[0]![0]).toBe("/api/v1/decisoes?estado=barrada&limite=50");
  });
});

describe("lerCookieCsrf", () => {
  it("lê o cookie do token CSRF", () => {
    expect(lerCookieCsrf("a=1; zt_csrf=abc%3D; b=2")).toBe("abc=");
    expect(lerCookieCsrf("a=1")).toBeNull();
  });
});

describe("csrf da sessão", () => {
  it("usa o csrf guardado da sessão e esquece ao sair", async () => {
    const fetchFalso = vi.fn(async (..._a: Parameters<typeof fetch>) => new Response(null, { status: 204 }));
    const cliente = criarCliente({ fetch: fetchFalso });
    cliente.definirCsrf?.("da-sessao");
    await cliente.pedir("POST", "/x", null, {});
    expect(new Headers(fetchFalso.mock.calls[0]![1]!.headers).get(CABECALHO_CSRF)).toBe("da-sessao");
    cliente.definirCsrf?.(null);
    await cliente.pedir("POST", "/x", null, {});
    expect(new Headers(fetchFalso.mock.calls[1]![1]!.headers).has(CABECALHO_CSRF)).toBe(false);
  });
});
