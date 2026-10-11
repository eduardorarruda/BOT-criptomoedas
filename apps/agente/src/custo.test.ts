import type { BetaMessage } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { describe, expect, it } from "vitest";
import { custoUsd } from "./custo.js";
import { TABELA_PRECOS } from "./precos.js";

type Uso = Partial<BetaMessage["usage"]>;
const mensagem = (usage: Uso, model = "claude-opus-5"): BetaMessage =>
  ({
    model,
    usage: {
      input_tokens: 0,
      output_tokens: 0,
      cache_creation_input_tokens: null,
      cache_read_input_tokens: null,
      cache_creation: null,
      iterations: null,
      ...usage,
    },
  }) as unknown as BetaMessage;

describe("custo da análise", () => {
  it("tabela datada com os preços do claude-opus-5 (US$ por milhão de tokens)", () => {
    expect(TABELA_PRECOS.conferidaEm).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(TABELA_PRECOS.modelos["claude-opus-5"]).toMatchObject({ entrada: "5", saida: "25" });
  });

  it("entrada a US$ 5/M e saída a US$ 25/M, em decimal exato", () => {
    expect(custoUsd([mensagem({ input_tokens: 1_000_000, output_tokens: 1_000_000 })]).toFixed()).toBe("30");
    expect(custoUsd([mensagem({ input_tokens: 1, output_tokens: 1 })]).toFixed()).toBe("0.00003");
  });

  it("cache: leitura a 0,1× e escrita a 1,25× (5 min) ou 2× (1 h) da entrada", () => {
    const leitura = mensagem({ cache_read_input_tokens: 1_000_000 });
    expect(custoUsd([leitura]).toFixed()).toBe("0.5");
    const escrita = mensagem({ cache_creation_input_tokens: 2_000_000 });
    expect(custoUsd([escrita]).toFixed()).toBe("12.5");
    const porTtl = mensagem({
      cache_creation_input_tokens: 2_000_000,
      cache_creation: { ephemeral_5m_input_tokens: 1_000_000, ephemeral_1h_input_tokens: 1_000_000 },
    });
    expect(custoUsd([porTtl]).toFixed()).toBe("16.25");
  });

  it("soma todas as voltas do laço de ferramentas", () => {
    const m = mensagem({ input_tokens: 1000, output_tokens: 100 });
    expect(custoUsd([m, m, m]).toFixed()).toBe(custoUsd([m]).times(3).toFixed());
  });

  it("quando há iterações (fallback do servidor), cobra cada uma pelo modelo que rodou", () => {
    const m = mensagem({
      input_tokens: 999,
      output_tokens: 999,
      iterations: [
        {
          type: "message",
          model: null,
          input_tokens: 1_000_000,
          output_tokens: 0,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
        },
        {
          type: "fallback_message",
          model: "claude-opus-4-8",
          input_tokens: 0,
          output_tokens: 1_000_000,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
        },
      ] as never,
    });
    expect(custoUsd([m]).toFixed()).toBe("30");
  });

  it("modelo desconhecido é cobrado pelo preço mais alto da tabela (melhor errar para cima)", () => {
    const m = mensagem({ input_tokens: 1_000_000 }, "modelo-novo");
    expect(custoUsd([m]).toFixed()).toBe("10");
  });

  it("cada modelo escolhível tem o seu preço (Sonnet 5: US$ 2/M de entrada, 0,2 na leitura de cache)", () => {
    const m = mensagem(
      { input_tokens: 1_000_000, output_tokens: 0, cache_read_input_tokens: 1_000_000 },
      "claude-sonnet-5",
    );
    expect(custoUsd([m]).toFixed()).toBe("2.2");
  });
});
