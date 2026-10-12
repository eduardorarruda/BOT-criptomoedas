import { dec, type Execucao } from "@zentrade/dominio";
import { describe, expect, it } from "vitest";
import { bpsContra, custoDeslizamento, SEM_CUSTOS } from "./custos.js";

const execucao = (lado: Execucao["lado"], preco: string, quantidade = "1"): Execucao => ({
  lado,
  preco: dec(preco),
  quantidade: dec(quantidade),
  taxaCotacao: dec(0),
  em: 0,
});

describe("custos do backtest", () => {
  it("deslizamento e meio spread somam contra quem opera", () => {
    expect(bpsContra({ taxaPorLado: 0.001, deslizamentoBps: 5, meioSpreadBps: 2 })).toBe(7);
    expect(bpsContra(SEM_CUSTOS)).toBe(0);
  });

  it("quanto o deslizamento custou: diferença para o preço de referência, feito à mão", () => {
    // 10 bps: compra de referência 100 sai a 100,10 (custo 0,10); venda a 99,90 (custo 0,10).
    expect(custoDeslizamento([execucao("COMPRA", "100.1")], 10).toFixed()).toBe("0.1");
    expect(custoDeslizamento([execucao("VENDA", "99.9")], 10).toFixed()).toBe("0.1");
    // 2 unidades compradas a 50,05 (referência 50): 2 × 0,05 = 0,1.
    expect(
      custoDeslizamento([execucao("COMPRA", "50.05", "2"), execucao("VENDA", "99.9")], 10).toFixed(),
    ).toBe("0.2");
    expect(custoDeslizamento([execucao("COMPRA", "100")], 0).isZero()).toBe(true);
    expect(custoDeslizamento([], 10).isZero()).toBe(true);
  });
});
