import { describe, expect, it } from "vitest";
import { robosIniciais } from "./dados";
import { condicoesDaExplicacao, historicoDemo, pensamentosIniciais } from "./pensamentos";

describe("pensamento do exemplo", () => {
  it("mostra alta, queda e lateral, cada um num ativo", () => {
    const p = pensamentosIniciais(robosIniciais(1_000_000), 1_000_000);
    const cenarios = Object.fromEntries(p.map((x) => [x.simbolo, x.pensamento.cenario.cenario]));
    expect(cenarios).toMatchObject({ BTCUSDT: "alta", ETHUSDT: "queda", SOLUSDT: "lateral" });
  });

  it("o robô com Claude desligado diz isso no pensamento", () => {
    const bnb = pensamentosIniciais(robosIniciais(1), 1).find((x) => x.simbolo === "BNBUSDT");
    expect(bnb?.pensamento.agente).toBe("desligado");
  });

  it("lê as condições da explicação antiga: E, OU e NÃO", () => {
    const e = condicoesDaExplicacao(
      "(RSI(14) (28,4) < 30: sim) e (preço (64.180,4) > SMA(200) (61.902,15): sim)",
    );
    expect(e?.tipo).toBe("e");
    expect(e?.filhos?.map((f) => f.texto)).toEqual([
      "RSI(14) (28,4) < 30",
      "preço (64.180,4) > SMA(200) (61.902,15)",
    ]);
    const ou = condicoesDaExplicacao(
      "(preço (151,32) > 1,02 × SMA(50) (148,05): sim) ou (preço cruzou acima de SMA(20): não)",
    );
    expect(ou?.tipo).toBe("ou");
    expect(ou?.valor).toBe(true);
    const nao = condicoesDaExplicacao(
      "(EMA(9) (2.468,9) cruzou acima de EMA(21) (2.466,2): sim) e não (RSI(14) (54,1) > 70: não)",
    );
    expect(nao?.filhos?.[1]).toMatchObject({ tipo: "nao", valor: true });
    expect(condicoesDaExplicacao("preço 64.702,1 chegou ao alvo")).toBeNull();
  });

  it("o histórico traz primeira leitura, virada de cenário e sinal, do mais novo ao mais velho", () => {
    const btc = robosIniciais(1_000_000_000).find((r) => r.id === "r-btc")!;
    const h = historicoDemo(btc, 1_000_000_000);
    expect(h.map((x) => x.motivo)).toEqual(["sinal", "cenario", "inicio"]);
    expect(h[0]!.pensamento.em).toBeGreaterThan(h[1]!.pensamento.em);
  });
});
