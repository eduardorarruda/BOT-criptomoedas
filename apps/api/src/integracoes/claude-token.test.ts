import { ESTADO_TOKEN_CLAUDE_VAZIO } from "@zentrade/contratos";
import { describe, expect, it, vi } from "vitest";
import { criarClienteTokenClaude, ErroAgenteTokenClaude } from "./claude-token.js";

const SEGREDO = "s".repeat(40);
const ANA = "7b0c8a52-1d2e-4c3b-9a8f-0e1d2c3b4a59";
const CONEXAO = "0f3e2d1c-4b5a-4968-8776-655443322110";
const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });

function cliente(resposta: () => Promise<Response>) {
  const buscar = vi.fn(async (_url: string, _init?: RequestInit) => resposta());
  return { buscar, c: criarClienteTokenClaude({ url: "http://agente:8081", segredo: SEGREDO, buscar }) };
}

const erroDe = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return e as ErroAgenteTokenClaude;
  }
  throw new Error("deveria falhar");
};

describe("cliente do token do Claude no agente", () => {
  it("manda só o usuarioId (e o código) com o segredo, nas rotas certas", async () => {
    const conexao = {
      conexaoId: CONEXAO,
      urlAutorizacao: "https://claude.ai/oauth/authorize?x=1",
      expiraEm: 1,
    };
    const { c, buscar } = cliente(async () => json(conexao, 201));
    expect(await c.conectar(ANA)).toEqual(conexao);
    const [url, init] = buscar.mock.calls[0]!;
    expect(url).toBe("http://agente:8081/assistente/claude-token/conexao");
    expect(init?.method).toBe("POST");
    expect((init?.headers as Record<string, string>)["authorization"]).toBe(`Bearer ${SEGREDO}`);
    expect(JSON.parse(String(init?.body))).toEqual({ usuarioId: ANA });

    const e = cliente(async () => json(ESTADO_TOKEN_CLAUDE_VAZIO));
    await e.c.enviarCodigo(ANA, CONEXAO, "abc#def12345");
    expect(e.buscar.mock.calls[0]![0]).toBe(
      `http://agente:8081/assistente/claude-token/conexao/${CONEXAO}/codigo`,
    );
    expect(JSON.parse(String(e.buscar.mock.calls[0]![1]?.body))).toEqual({
      usuarioId: ANA,
      codigo: "abc#def12345",
    });

    const x = cliente(async () => new Response(null, { status: 204 }));
    await x.c.cancelar(ANA, CONEXAO);
    expect(x.buscar.mock.calls[0]![0]).toMatch(/\/cancelar$/);

    const t = cliente(async () => json({ ok: true, mensagem: null }));
    expect(await t.c.testar(ANA)).toEqual({ ok: true, mensagem: null });
  });

  it("link de autorização fora da Anthropic nunca passa para a tela", async () => {
    const { c } = cliente(async () =>
      json({ conexaoId: CONEXAO, urlAutorizacao: "https://evil.example/oauth", expiraEm: 1 }, 201),
    );
    expect(await erroDe(c.conectar(ANA))).toMatchObject({ status: 502, codigo: "falha_agente" });
  });

  it("erro do agente sai com o status e o código dele; segredo errado e agente fora viram 503", async () => {
    const recusa = cliente(async () =>
      json({ erro: { codigo: "codigo_recusado", mensagem: "O Claude não aceitou esse código." } }, 422),
    );
    expect(await erroDe(recusa.c.enviarCodigo(ANA, CONEXAO, "x".repeat(10)))).toMatchObject({
      status: 422,
      codigo: "codigo_recusado",
      message: "O Claude não aceitou esse código.",
    });
    const segredo = cliente(async () => json({}, 401));
    expect(await erroDe(segredo.c.testar(ANA))).toMatchObject({ status: 503, codigo: "agente_fora_do_ar" });
    const fora = cliente(async () => {
      throw new TypeError("fetch failed");
    });
    expect(await erroDe(fora.c.testar(ANA))).toMatchObject({ status: 503, codigo: "agente_fora_do_ar" });
    const estranho = cliente(async () => new Response("<html>", { status: 500 }));
    expect(await erroDe(estranho.c.testar(ANA))).toMatchObject({ status: 502, codigo: "falha_agente" });
  });
});
