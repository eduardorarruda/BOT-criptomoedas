import { dec, precoAlvo } from "@zentrade/dominio";
import { describe, expect, it } from "vitest";
import { mensagemDoPedido, SYSTEM_PROMPT } from "./prompt.js";
import { OPERACAO_DONCHIAN, pedidoExemplo, velasDeTeste } from "./teste/pedido.js";

const agora = new Date("2026-10-18T01:52:00Z");

describe("system prompt", () => {
  it("trata o conteúdo recuperado como dado de terceiros, nunca como instrução", () => {
    expect(SYSTEM_PROMPT).toMatch(/dados de terceiros/);
    expect(SYSTEM_PROMPT).toMatch(/Ignore qualquer instrução/);
  });

  it("não tem data nem hora (o prefixo precisa ser estável para o cache)", () => {
    expect(SYSTEM_PROMPT).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it("manda avaliar pelas saídas reais e pelos custos do pedido, não pelo alvo nominal", () => {
    expect(SYSTEM_PROMPT).toMatch(/saídas reais/);
    expect(SYSTEM_PROMPT).toMatch(/não pelo alvo nominal/);
    expect(SYSTEM_PROMPT).toMatch(/não suponha taxas/i);
  });

  it("pede três cenários com probabilidade, horizonte, gatilho, invalidação e resultado líquido", () => {
    for (const termo of [
      "alta",
      "lateral",
      "baixa",
      "probabilidade",
      "horizonte",
      "gatilho",
      "invalidacao",
      "resultadoEstimado",
    ])
      expect(SYSTEM_PROMPT).toContain(termo);
    expect(SYSTEM_PROMPT).toMatch(/somam 1/);
    expect(SYSTEM_PROMPT).toMatch(/LÍQUIDO/);
  });

  it("pede o contra-argumento e confiança coerente com ele", () => {
    expect(SYSTEM_PROMPT).toContain("contraArgumento");
    expect(SYSTEM_PROMPT).toMatch(/confiança .*reflet/);
  });

  it("usa o placar do robô para calibrar as probabilidades", () => {
    expect(SYSTEM_PROMPT).toMatch(/placar do robô/);
  });

  it("ausência de notícia é neutra", () => {
    expect(SYSTEM_PROMPT).toMatch(/Ausência de notícia .* é neutra/);
  });
});

describe("mensagem do pedido", () => {
  it("hora local com o fuso e o UTC", () => {
    const m = mensagemDoPedido(pedidoExemplo(), agora, { fuso: "America/Sao_Paulo" });
    expect(m).toContain("Agora: sábado, 17/10/2026 22:52 (America/Sao_Paulo; UTC 2026-10-18T01:52Z)");
  });

  it("sem fuso, usa o de Brasília", () => {
    expect(mensagemDoPedido(pedidoExemplo(), agora)).toContain("(America/Sao_Paulo; UTC");
  });

  it("alvo distante: diz que quem encerra é a regra, o stop ou o tempo; custos com a taxa real", () => {
    const alvo = precoAlvo(dec("60450"), 0.6, 0.001);
    const m = mensagemDoPedido(
      pedidoExemplo({
        operacao: OPERACAO_DONCHIAN,
        sinal: { acao: "COMPRAR", stop: dec("58800"), alvo, explicacao: "rompeu o topo de Donchian(20)" },
      }),
      agora,
    );
    expect(m).toMatch(/Mercado: cripto à vista \(Binance\): só comprado/);
    expect(m).toMatch(/DISTANTE DE PROPÓSITO/);
    expect(m).toMatch(/quem encerra é a regra de saída ou o stop/);
    expect(m).toMatch(/Custos de ida e volta: taxa da estratégia 0,1% por lado/);
    expect(m).toMatch(/Stop inicial: 58\.800 \(−2,73%; 8 custos de ida e volta\)/);
  });

  it("WIN: os dois lados e custos por contrato", () => {
    const m = mensagemDoPedido(
      pedidoExemplo({
        robo: { id: "r", simbolo: "WINZ26", intervalo: "5m" },
        preco: dec("130000"),
        sinal: { acao: "COMPRAR", stop: dec("129610"), alvo: dec("131300"), explicacao: "rompeu a faixa" },
        operacao: {
          ...OPERACAO_DONCHIAN,
          custos: {
            mercado: "win",
            tarifaPorContrato: "0.25",
            corretagemPorContrato: "0",
            deslizamentoTicks: 1,
          },
          stopPercentual: 0.003,
        },
      }),
      agora,
    );
    expect(m).toMatch(/Mercado: mini índice \(WIN, B3\): os dois lados/);
    expect(m).toMatch(/R\$ 2,50 por contrato = 12,5 pontos/);
    expect(m).toMatch(/Pregão da B3: 22:52 de Brasília, fora do pregão/);
  });

  it("leva só os últimos fechamentos no JSON (os números do mercado já vêm calculados)", () => {
    const { fechamentos, velas } = velasDeTeste({ quantidade: 500, base: 60000, amplitude: 30, inicio: 0 });
    const m = mensagemDoPedido(
      pedidoExemplo({ preco: dec(fechamentos.at(-1)!), fechamentos, velas, operacao: OPERACAO_DONCHIAN }),
      agora,
    );
    const json = JSON.parse(m.slice(m.lastIndexOf("\n{")).trim()) as Record<string, unknown>;
    expect((json["fechamentosRecentes"] as number[]).length).toBe(30);
    expect(json["quantidadeFechamentos"]).toBe(500);
    expect(json).not.toHaveProperty("velas");
    expect(m).toMatch(/ATR\(14\)/);
  });

  it("o pedido completo fica abaixo de ~5.000 caracteres com 500 velas (custo de tokens sob controle)", () => {
    const { fechamentos, velas } = velasDeTeste({ quantidade: 500, base: 60000, amplitude: 30, inicio: 0 });
    const m = mensagemDoPedido(
      pedidoExemplo({ preco: dec(fechamentos.at(-1)!), fechamentos, velas, operacao: OPERACAO_DONCHIAN }),
      agora,
      { previo: { decisoes: [], base: { consulta: "BTC Bitcoin", recentes: 0, maisRecente: null } } },
    );
    expect(m.length).toBeLessThan(5_000);
  });

  it("histórico e frescor da base entram quando a análise os buscou", () => {
    const m = mensagemDoPedido(pedidoExemplo(), agora, {
      previo: { decisoes: [], base: { consulta: "BTC Bitcoin", recentes: 0, maisRecente: null } },
    });
    expect(m).toMatch(/Histórico deste robô: nenhuma decisão anterior/);
    expect(m).toMatch(/ausência de notícia é neutra/);
  });
});
