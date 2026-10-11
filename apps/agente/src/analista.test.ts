import { describe, expect, it, vi } from "vitest";
import { Analista, ErroPropostaInvalida } from "./analista.js";
import type { DependenciasFerramentas } from "./ferramentas/index.js";
import { SYSTEM_PROMPT } from "./prompt.js";
import { anthropicFalso, mensagemFalsa, texto, usoFerramenta } from "./teste/anthropic-falso.js";
import { pedidoExemplo, USUARIO_TESTE } from "./teste/pedido.js";

const achado = {
  trechoId: "t1",
  documentoId: "doc-taxas",
  fonte: "regra_corretora" as const,
  titulo: "Taxas da corretora",
  url: null,
  publicadoEm: new Date("2026-09-01T00:00:00Z"),
  texto: "taxa de 0,1% por ordem",
  pontuacao: 0.03,
};

function dependencias(): DependenciasFerramentas {
  return { busca: { buscar: vi.fn(async () => [achado]) }, historico: { recentes: vi.fn(async () => []) } };
}

const propostaValida = {
  acao: "comprar",
  confianca: 0.7,
  tamanhoRelativo: 0.5,
  stop: "58800",
  alvo: "61000",
  justificativa: "Preço abaixo da média; a taxa de 0,1% cabe no alvo.",
  riscos: ["mercado em queda"],
  fontes: [{ tipo: "regra_corretora", id: "doc-taxas", titulo: "Taxas da corretora", data: "2026-09-01" }],
};

const agora = () => new Date("2026-10-10T12:00:00Z");

function analista(respostas: Parameters<typeof anthropicFalso>[0], maxIteracoes?: number) {
  const falso = anthropicFalso(respostas);
  const a = new Analista({
    cliente: falso.cliente,
    dependencias: dependencias(),
    agora,
    ...(maxIteracoes ? { maxIteracoes } : {}),
  });
  return { a, pedidos: falso.pedidos };
}

const analisar = (a: Analista) => a.analisar(pedidoExemplo(), { usuarioId: USUARIO_TESTE });

describe("Analista", () => {
  it("proposta válida passa, depois de usar as ferramentas", async () => {
    const { a, pedidos } = analista([
      mensagemFalsa({
        content: [
          usoFerramenta("retrato_mercado", {}),
          usoFerramenta("buscar_conhecimento", { consulta: "taxa" }),
        ],
        stop_reason: "tool_use",
      }),
      mensagemFalsa({ content: [texto(JSON.stringify(propostaValida))], stop_reason: "end_turn" }),
    ]);
    const r = await analisar(a);
    expect(r.proposta).toEqual(propostaValida);
    // 2 chamadas × (1000 de entrada × US$ 5/M + 200 de saída × US$ 25/M) = US$ 0,02
    expect(r.custoUsd.toFixed()).toBe("0.02");
    expect(pedidos).toHaveLength(2);
    const resultados = pedidos[1]!.corpo.messages.at(-1)!.content as { type: string; tool_use_id: string }[];
    expect(resultados.map((b) => b.type)).toEqual(["tool_result", "tool_result"]);
  });

  it("monta o pedido como manda o contrato: modelo, pensamento adaptativo, fallback, saída estruturada e cache", async () => {
    const { a, pedidos } = analista([
      mensagemFalsa({
        content: [texto(JSON.stringify({ ...propostaValida, fontes: [] }))],
        stop_reason: "end_turn",
      }),
    ]);
    await analisar(a);
    const { corpo, cabecalhos, url } = pedidos[0]!;
    expect(url).toMatch(/\/v1\/messages\?beta=true$/);
    expect(corpo.model).toBe("claude-opus-5");
    expect(corpo.thinking).toEqual({ type: "adaptive" });
    expect(corpo.fallbacks).toBe("default");
    expect(cabecalhos.get("anthropic-beta")).toContain("server-side-fallback-2026-07-01");
    expect((corpo.output_config as { format: { type: string } }).format.type).toBe("json_schema");
    const system = corpo.system as { text: string; cache_control?: unknown }[];
    expect(system.at(-1)!.cache_control).toEqual({ type: "ephemeral" });
    expect(system.map((s) => s.text).join("")).toBe(SYSTEM_PROMPT);
    expect((corpo.tools as { name: string }[]).map((t) => t.name)).toEqual([
      "retrato_mercado",
      "posicao_e_orcamento",
      "buscar_conhecimento",
      "historico_decisoes",
    ]);
    const pergunta = JSON.stringify(corpo.messages[0]);
    expect(pergunta).toContain("2026-10-10T12:00:00.000Z");
    expect(pergunta).toContain("BTCUSDT");
  });

  it("proposta fora do esquema vira erro tratado (ErroPropostaInvalida), não proposta", async () => {
    const invalida = { ...propostaValida, confianca: 1.5 };
    const { a } = analista([
      mensagemFalsa({ content: [texto(JSON.stringify(invalida))], stop_reason: "end_turn" }),
    ]);
    await expect(analisar(a)).rejects.toBeInstanceOf(ErroPropostaInvalida);
    const { a: a2 } = analista([mensagemFalsa({ content: [texto("não sei")], stop_reason: "end_turn" })]);
    await expect(analisar(a2)).rejects.toThrow(/proposta/i);
  });

  it("recusa do modelo vira 'aguardar' com o motivo", async () => {
    const { a } = analista([
      mensagemFalsa({
        content: [],
        stop_reason: "refusal",
        stop_details: { type: "refusal", category: "cyber", explanation: "pedido parecido com ataque" },
      }),
    ]);
    const r = await analisar(a);
    expect(r.proposta).toMatchObject({ acao: "aguardar", confianca: 0, tamanhoRelativo: 0, fontes: [] });
    expect(r.proposta.justificativa).toMatch(/recus/i);
    expect(r.proposta.justificativa).toMatch(/cyber/);
  });

  it("recusa sem detalhes e parada inesperada também viram 'aguardar'", async () => {
    const { a } = analista([mensagemFalsa({ content: [], stop_reason: "refusal" })]);
    expect((await analisar(a)).proposta.justificativa).toMatch(/recusou/);
    const { a: a2 } = analista([
      mensagemFalsa({ content: [], stop_reason: "model_context_window_exceeded" }),
    ]);
    const r = await analisar(a2);
    expect(r.proposta.acao).toBe("aguardar");
    expect(r.proposta.justificativa).toMatch(/model_context_window_exceeded/);
  });

  it("limite de tokens vira 'aguardar' com o motivo", async () => {
    const { a } = analista([
      mensagemFalsa({ content: [texto('{"acao": "comp')], stop_reason: "max_tokens" }),
    ]);
    const r = await analisar(a);
    expect(r.proposta.acao).toBe("aguardar");
    expect(r.proposta.justificativa).toMatch(/tokens/);
  });

  it("análise que não termina dentro do limite de voltas vira 'aguardar'", async () => {
    const volta = () =>
      mensagemFalsa({
        content: [usoFerramenta("retrato_mercado", {}, `t${Math.random()}`)],
        stop_reason: "tool_use",
      });
    const { a } = analista([volta(), volta()], 2);
    const r = await analisar(a);
    expect(r.proposta.acao).toBe("aguardar");
    expect(r.proposta.justificativa).toMatch(/voltas|terminou/);
  });

  it("descarta fonte que nenhuma ferramenta devolveu e avisa nos riscos", async () => {
    const inventada = { tipo: "noticia", id: "nao-existe", titulo: "Notícia inventada" };
    const { a } = analista([
      mensagemFalsa({
        content: [texto(JSON.stringify({ ...propostaValida, fontes: [inventada] }))],
        stop_reason: "end_turn",
      }),
    ]);
    const r = await analisar(a);
    expect(r.proposta.fontes).toEqual([]);
    expect(r.proposta.riscos.at(-1)).toMatch(/1 fonte/);
  });

  it("erro da API da Anthropic sobe para quem chamou (o motor não opera)", async () => {
    const { a } = analista([
      { status: 500, corpo: { type: "error", error: { type: "api_error", message: "caiu" } } },
    ]);
    await expect(analisar(a)).rejects.toThrow();
  });
});
