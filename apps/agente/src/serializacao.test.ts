import { dec, POSICAO_ZERADA } from "@zentrade/dominio";
import type { PedidoAnalise } from "@zentrade/contratos";
import { describe, expect, it } from "vitest";
import { lerCorpoAnalise, pedidoDeJson, pedidoParaJson } from "./serializacao.js";
import { pedidoExemplo } from "./teste/pedido.js";

const pedido: PedidoAnalise = {
  robo: { id: "r1", simbolo: "BTCUSDT", intervalo: "1h" },
  sinal: {
    acao: "COMPRAR",
    stop: dec("58800.5"),
    alvo: dec("61000.123456789"),
    explicacao: "abaixo da média",
  },
  preco: dec("60000.01"),
  fechamentos: [59000, 59500.5, 60000.01],
  posicao: { ...POSICAO_ZERADA, quantidade: dec("0.00123"), precoMedio: dec("59000") },
};

describe("serialização do PedidoAnalise", () => {
  it("decimais viajam como texto e voltam exatos", () => {
    const json = pedidoParaJson(pedido);
    expect(json.preco).toBe("60000.01");
    expect(json.sinal).toEqual({
      acao: "COMPRAR",
      stop: "58800.5",
      alvo: "61000.123456789",
      explicacao: "abaixo da média",
    });
    expect(json.posicao.quantidade).toBe("0.00123");
    const volta = pedidoDeJson(JSON.parse(JSON.stringify(json)));
    expect(volta.preco.equals(pedido.preco)).toBe(true);
    expect(volta.sinal.acao === "COMPRAR" && volta.sinal.alvo.toFixed()).toBe("61000.123456789");
    expect(volta.posicao.quantidade.toFixed()).toBe("0.00123");
    expect(volta.fechamentos).toEqual(pedido.fechamentos);
  });

  it("serializa venda e aguardar", () => {
    const venda = pedidoParaJson({
      ...pedido,
      sinal: { acao: "VENDER", motivo: "alvo", explicacao: "alvo" },
    });
    expect(venda.sinal).toEqual({ acao: "VENDER", motivo: "alvo", explicacao: "alvo" });
    const tempo = { acao: "VENDER", motivo: "tempo", explicacao: "a posição completou 10 candles" } as const;
    expect(lerCorpoAnalise(pedidoParaJson({ ...pedido, sinal: tempo })).ok).toBe(true);
    const espera = pedidoParaJson({ ...pedido, sinal: { acao: "AGUARDAR", explicacao: "nada" } });
    expect(pedidoDeJson(espera).sinal).toEqual({ acao: "AGUARDAR", explicacao: "nada" });
  });

  it("lê o corpo do POST /analisar com as extensões opcionais (usuarioId e orçamento)", () => {
    const corpo = {
      ...pedidoParaJson(pedido),
      usuarioId: "7b0c8a52-1d2e-4c3b-9a8f-0e1d2c3b4a59",
      orcamento: {
        riscoPorOperacao: "10",
        exposicaoMaxima: "1000",
        perdaDiariaMaxima: "50",
        exposicaoAtual: "200",
      },
    };
    const lido = lerCorpoAnalise(corpo);
    expect(lido.ok).toBe(true);
    if (!lido.ok) return;
    expect(lido.valor.usuarioId).toBe(corpo.usuarioId);
    expect(lido.valor.orcamento?.exposicaoMaxima.toFixed()).toBe("1000");
    expect(lido.valor.orcamento?.resultadoDoDia).toBeUndefined();
  });

  it("recusa decimal como número, símbolo torto e fechamentos não finitos, dizendo onde", () => {
    const base = pedidoParaJson(pedido);
    const r1 = lerCorpoAnalise({ ...base, preco: 60000 });
    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(r1.erro).toMatch(/preco/);
    expect(lerCorpoAnalise({ ...base, robo: { ...base.robo, simbolo: "btc" } }).ok).toBe(false);
    expect(lerCorpoAnalise({ ...base, fechamentos: [1, "2"] }).ok).toBe(false);
    expect(lerCorpoAnalise(null).ok).toBe(false);
  });

  it("leva e traz o analiseId que liga os passos ao vivo à decisão", () => {
    const comId = pedidoExemplo({ analiseId: "analise-1" });
    const json = pedidoParaJson(comId);
    expect(json.analiseId).toBe("analise-1");
    const lido = lerCorpoAnalise(json);
    expect(lido.ok && lido.valor.pedido.analiseId).toBe("analise-1");
    expect(pedidoParaJson(pedidoExemplo()).analiseId).toBeUndefined();
  });
});
