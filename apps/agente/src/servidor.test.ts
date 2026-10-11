import type { PropostaAgente } from "@zentrade/contratos";
import { dec } from "@zentrade/dominio";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ErroPropostaInvalida, type OpcoesAnalise } from "./analista.js";
import { pedidoParaJson } from "./serializacao.js";
import { criarServidor, type AnalistaServico } from "./servidor.js";
import { pedidoExemplo, USUARIO_TESTE } from "./teste/pedido.js";

const SEGREDO = "s".repeat(40);
const proposta: PropostaAgente = {
  acao: "aguardar",
  confianca: 0.2,
  tamanhoRelativo: 0,
  justificativa: "sem confirmação",
  riscos: [],
  fontes: [],
};

function servidor(
  analisar: AnalistaServico["analisar"],
  extra: { timeoutMs?: number; usuarioIdPadrao?: string } = {},
) {
  return criarServidor({ analista: { analisar }, segredo: SEGREDO, logger: false, ...extra });
}

const corpo = { ...pedidoParaJson(pedidoExemplo()), usuarioId: USUARIO_TESTE };
const cabecalhos = { authorization: `Bearer ${SEGREDO}` };

let app: ReturnType<typeof criarServidor> | undefined;
afterEach(async () => app?.close());

describe("POST /analisar", () => {
  it("devolve { proposta, custoUsd } com o custo em texto", async () => {
    const analisar = vi.fn(async () => ({ proposta, custoUsd: dec("0.0123") }));
    app = servidor(analisar);
    const r = await app.inject({ method: "POST", url: "/analisar", headers: cabecalhos, payload: corpo });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ proposta, custoUsd: "0.0123" });
    const [pedido, opcoes] = analisar.mock.calls[0] as unknown as [unknown, OpcoesAnalise];
    expect((pedido as { preco: { toFixed(): string } }).preco.toFixed()).toBe("60450");
    expect(opcoes.usuarioId).toBe(USUARIO_TESTE);
    expect(opcoes.signal).toBeInstanceOf(AbortSignal);
  });

  it("exige Authorization: Bearer com o segredo certo", async () => {
    const analisar = vi.fn();
    app = servidor(analisar);
    for (const headers of [{}, { authorization: "Bearer errado" }, { authorization: SEGREDO }]) {
      const r = await app.inject({ method: "POST", url: "/analisar", headers, payload: corpo });
      expect(r.statusCode).toBe(401);
      expect(r.json().erro.codigo).toBe("nao_autorizado");
    }
    expect(analisar).not.toHaveBeenCalled();
  });

  it("valida o corpo e diz o que está errado", async () => {
    app = servidor(vi.fn());
    const r = await app.inject({
      method: "POST",
      url: "/analisar",
      headers: cabecalhos,
      payload: { ...corpo, preco: 1 },
    });
    expect(r.statusCode).toBe(400);
    expect(r.json().erro).toMatchObject({ codigo: "pedido_invalido" });
    expect(r.json().erro.mensagem).toMatch(/preco/);
  });

  it("usa o usuário padrão do serviço quando o pedido não traz, e recusa se não houver nenhum", async () => {
    const analisar = vi.fn(async () => ({ proposta, custoUsd: dec(0) }));
    const { usuarioId: _u, ...semUsuario } = corpo;
    app = servidor(analisar, { usuarioIdPadrao: USUARIO_TESTE });
    expect(
      (await app.inject({ method: "POST", url: "/analisar", headers: cabecalhos, payload: semUsuario }))
        .statusCode,
    ).toBe(200);
    await app.close();
    app = servidor(analisar);
    const r = await app.inject({
      method: "POST",
      url: "/analisar",
      headers: cabecalhos,
      payload: semUsuario,
    });
    expect(r.statusCode).toBe(400);
    expect(r.json().erro.mensagem).toMatch(/ZENTRADE_USUARIO_ID/);
  });

  it("proposta inválida do modelo vira 502 com código próprio", async () => {
    app = servidor(async () => {
      throw new ErroPropostaInvalida("fora do esquema");
    });
    const r = await app.inject({ method: "POST", url: "/analisar", headers: cabecalhos, payload: corpo });
    expect(r.statusCode).toBe(502);
    expect(r.json().erro.codigo).toBe("proposta_invalida");
  });

  it("estoura o tempo e responde 504 (o motor não opera)", async () => {
    app = servidor(
      (_p, o) =>
        new Promise((_ok, falhar) =>
          o.signal?.addEventListener("abort", () => falhar(new Error("abortado"))),
        ),
      { timeoutMs: 20 },
    );
    const r = await app.inject({ method: "POST", url: "/analisar", headers: cabecalhos, payload: corpo });
    expect(r.statusCode).toBe(504);
    expect(r.json().erro.codigo).toBe("tempo_esgotado");
  });

  it("outras falhas viram 502 sem vazar detalhe interno", async () => {
    app = servidor(async () => {
      throw new Error("ECONNRESET em 10.0.0.3 com chave sk-...");
    });
    const r = await app.inject({ method: "POST", url: "/analisar", headers: cabecalhos, payload: corpo });
    expect(r.statusCode).toBe(502);
    expect(r.json().erro.codigo).toBe("falha_agente");
    expect(r.body).not.toMatch(/sk-|10\.0\.0\.3/);
  });

  it("JSON malformado vira 400 no formato de erro do contrato", async () => {
    app = servidor(vi.fn());
    const r = await app.inject({
      method: "POST",
      url: "/analisar",
      headers: { ...cabecalhos, "content-type": "application/json" },
      payload: "{ não é json",
    });
    expect(r.statusCode).toBe(400);
    expect(r.json().erro.codigo).toBe("pedido_invalido");
  });

  it("GET /saude responde sem autenticação", async () => {
    app = servidor(vi.fn());
    const r = await app.inject({ method: "GET", url: "/saude" });
    expect(r.json()).toEqual({ ok: true });
  });
});
