import { dec, POSICAO_ZERADA } from "@zentrade/dominio";
import type { PedidoAnalise } from "@zentrade/contratos";
import { describe, expect, it, vi } from "vitest";
import { AgenteFixo } from "./agente-fixo.js";
import { USUARIO_LOCAL } from "../usuario-local.js";
import { AgenteHttp, pedidoNoFio } from "./agente-http.js";

const pedido = (acao: "COMPRAR" | "VENDER"): PedidoAnalise => ({
  robo: { id: "r1", simbolo: "BTCUSDT", intervalo: "15m" },
  sinal:
    acao === "COMPRAR"
      ? { acao, stop: dec(98), alvo: dec(101), explicacao: "regra" }
      : { acao, motivo: "alvo", explicacao: "regra" },
  preco: dec(100),
  fechamentos: [1, 2, 3],
  posicao: POSICAO_ZERADA,
});

const proposta = {
  acao: "comprar",
  confianca: 0.8,
  tamanhoRelativo: 1,
  justificativa: "ok",
  riscos: [],
  fontes: [],
};

describe("agente fixo (backtest e desenvolvimento)", () => {
  it("sempre concorda: repete a ação do sinal com custo zero", async () => {
    const a = new AgenteFixo("sempre_concorda", 0.9);
    const r = await a.analisar(pedido("VENDER"));
    expect(r.proposta.acao).toBe("vender");
    expect(r.proposta.confianca).toBe(0.9);
    expect(r.custoUsd.isZero()).toBe(true);
    expect((await a.analisar(pedido("COMPRAR"))).proposta.acao).toBe("comprar");
  });

  it("nunca concorda: aguarda", async () => {
    expect((await new AgenteFixo("nunca_concorda").analisar(pedido("COMPRAR"))).proposta.acao).toBe(
      "aguardar",
    );
  });

  it("falha: simula agente fora do ar", async () => {
    await expect(new AgenteFixo("falha").analisar(pedido("COMPRAR"))).rejects.toThrow(/fora do ar/);
  });
});

describe("agente por HTTP", () => {
  it("envia o pedido com Bearer e decimais em texto; valida a resposta", async () => {
    const fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const corpo = JSON.parse(String(init?.body)) as { preco: string; sinal: { stop: string } };
      expect(corpo.preco).toBe("100");
      expect(corpo.sinal.stop).toBe("98");
      expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer s".padEnd(7 + 32, "s"));
      return new Response(JSON.stringify({ proposta, custoUsd: "0.0123" }), { status: 200 });
    });
    const a = new AgenteHttp({ url: "http://agente:8081", segredo: "s".repeat(32), fetch });
    const r = await a.analisar(pedido("COMPRAR"));
    expect(r.proposta.confianca).toBe(0.8);
    expect(r.custoUsd.equals(dec("0.0123"))).toBe(true);
    expect(String(fetch.mock.calls[0]![0])).toBe("http://agente:8081/analisar");
  });

  it("erro HTTP, resposta torta e falha de rede viram erro explicado", async () => {
    const respostas = [
      () => new Response("x", { status: 500 }),
      () => new Response(JSON.stringify({ proposta: { acao: "x" } }), { status: 200 }),
      () => {
        throw new TypeError("fetch failed");
      },
    ];
    const fetch = vi.fn(async () => respostas.shift()!());
    const a = new AgenteHttp({ url: "http://agente:8081", segredo: "s".repeat(32), fetch });
    await expect(a.analisar(pedido("COMPRAR"))).rejects.toThrow(/HTTP 500/);
    await expect(a.analisar(pedido("COMPRAR"))).rejects.toThrow(/formato/);
    await expect(a.analisar(pedido("COMPRAR"))).rejects.toThrow(/não respondeu/);
  });

  it("serializa no formato do apps/agente: decimais em texto sem notação científica, usuarioId e orçamento", () => {
    const fio = pedidoNoFio({
      ...pedido("COMPRAR"),
      preco: dec("0.00000012"),
      posicao: { ...POSICAO_ZERADA, quantidade: dec("0.00000001") },
      usuarioId: "6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b",
      orcamento: {
        riscoPorOperacao: dec(10),
        exposicaoMaxima: dec(1000),
        perdaDiariaMaxima: dec(50),
        exposicaoAtual: dec("12.5"),
        resultadoDoDia: dec("-3.2"),
      },
    });
    expect(fio).toEqual({
      robo: { id: "r1", simbolo: "BTCUSDT", intervalo: "15m" },
      sinal: { acao: "COMPRAR", stop: "98", alvo: "101", explicacao: "regra" },
      preco: "0.00000012",
      fechamentos: [1, 2, 3],
      posicao: { quantidade: "0.00000001", precoMedio: "0", resultadoRealizado: "0", taxasPagas: "0" },
      usuarioId: "6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b",
      orcamento: {
        riscoPorOperacao: "10",
        exposicaoMaxima: "1000",
        perdaDiariaMaxima: "50",
        exposicaoAtual: "12.5",
        resultadoDoDia: "-3.2",
      },
    });
    const venda = pedidoNoFio({ ...pedido("VENDER"), usuarioId: USUARIO_LOCAL });
    expect(venda.sinal).toEqual({ acao: "VENDER", motivo: "alvo", explicacao: "regra" });
    expect(venda).not.toHaveProperty("usuarioId"); // o agente usa o ZENTRADE_USUARIO_ID dele
    expect(venda).not.toHaveProperty("orcamento");
  });
});
