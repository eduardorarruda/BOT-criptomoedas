import { dec } from "@zentrade/dominio";
import { describe, expect, it } from "vitest";
import { negociacao } from "../teste/negociacao.js";
import { ativosParaConverter, movimentosDe, taxaEmUsdt } from "./movimentos.js";

const texto = (v: { toFixed(): string } | null) => (v === null ? null : v.toFixed());

describe("taxa convertida para USDT pelo preço da negociação", () => {
  const par = { preco: dec("50000"), base: "BTC", cotacao: "USDT" };

  it("taxa em USDT vale ela mesma", () => {
    expect(texto(taxaEmUsdt({ ...par, taxa: dec("0.5"), ativoTaxa: "USDT" }, dec(1), null))).toBe("0.5");
  });

  it("taxa na moeda base vale taxa × preço da negociação", () => {
    expect(texto(taxaEmUsdt({ ...par, taxa: dec("0.00001"), ativoTaxa: "BTC" }, dec(1), null))).toBe("0.5");
  });

  it("taxa na moeda de cotação usa a cotação em USDT do instante", () => {
    const ethbtc = { preco: dec("0.05"), base: "ETH", cotacao: "BTC" };
    expect(texto(taxaEmUsdt({ ...ethbtc, taxa: dec("0.0001"), ativoTaxa: "BTC" }, dec("60000"), null))).toBe(
      "6",
    );
    expect(texto(taxaEmUsdt({ ...ethbtc, taxa: dec("0.001"), ativoTaxa: "ETH" }, dec("60000"), null))).toBe(
      "3",
    );
  });

  it("taxa em BNB usa o preço do BNB em USDT no instante; sem ele, null (nunca zero)", () => {
    expect(texto(taxaEmUsdt({ ...par, taxa: dec("0.002"), ativoTaxa: "BNB" }, dec(1), dec("600")))).toBe(
      "1.2",
    );
    expect(taxaEmUsdt({ ...par, taxa: dec("0.002"), ativoTaxa: "BNB" }, dec(1), null)).toBeNull();
  });

  it("taxa zero é zero mesmo sem preço", () => {
    expect(texto(taxaEmUsdt({ ...par, taxa: dec(0), ativoTaxa: "BNB" }, dec(1), null))).toBe("0");
  });

  it("sem cotação em USDT, taxa na base ou na cotação fica sem conversão", () => {
    const fdusd = { preco: dec("50000"), base: "BTC", cotacao: "FDUSD" };
    expect(taxaEmUsdt({ ...fdusd, taxa: dec("1"), ativoTaxa: "FDUSD" }, null, null)).toBeNull();
    expect(taxaEmUsdt({ ...fdusd, taxa: dec("0.1"), ativoTaxa: "BTC" }, null, null)).toBeNull();
  });

  it("diz quais moedas precisam de preço histórico", () => {
    expect(ativosParaConverter({ base: "BTC", cotacao: "USDT", ativoTaxa: "BNB" })).toEqual(["BNB"]);
    expect(ativosParaConverter({ base: "BTC", cotacao: "USDT", ativoTaxa: "BTC" })).toEqual([]);
    expect(ativosParaConverter({ base: "ETH", cotacao: "BTC", ativoTaxa: "BNB" })).toEqual(["BTC", "BNB"]);
    expect(ativosParaConverter({ base: "ETH", cotacao: "BTC", ativoTaxa: "BTC" })).toEqual(["BTC"]);
  });
});

describe("movimentos de uma negociação", () => {
  it("compra BTCUSDT com taxa em USDT: só o BTC mexe (USDT é a referência)", () => {
    const [m, ...resto] = movimentosDe(negociacao({ preco: "100", quantidade: "2", taxa: "0.2" }));
    expect(resto).toEqual([]);
    expect(m).toMatchObject({ ativo: "BTC", tipo: "compra" });
    expect([texto(m!.quantidade), texto(m!.precoUsdt), texto(m!.taxaUsdt)]).toEqual(["2", "100", "0.2"]);
  });

  it("compra com taxa na base: recebe a quantidade líquida (a taxa sai do que se recebe)", () => {
    const [m] = movimentosDe(
      negociacao({ preco: "100", quantidade: "2", taxa: "0.002", ativoTaxa: "BTC", taxaUsdt: "0.2" }),
    );
    expect([texto(m!.quantidade), texto(m!.taxaUsdt)]).toEqual(["1.998", "0.2"]);
  });

  it("venda com taxa na base: sai a quantidade vendida mais a taxa", () => {
    const [m] = movimentosDe(
      negociacao({ lado: "VENDA", preco: "100", quantidade: "1", taxa: "0.001", ativoTaxa: "BTC" }),
    );
    expect([m!.tipo, texto(m!.quantidade)]).toEqual(["venda", "1.001"]);
  });

  it("taxa em BNB: a negociação leva a taxa em USDT e o BNB é consumido à parte", () => {
    const ms = movimentosDe(
      negociacao({ preco: "100", quantidade: "1", taxa: "0.001", ativoTaxa: "BNB", taxaUsdt: "0.6" }),
    );
    expect(ms.map((m) => [m.ativo, m.tipo, texto(m.quantidade), texto(m.taxaUsdt)])).toEqual([
      ["BTC", "compra", "1", "0.6"],
      ["BNB", "taxa", "0.001", "0"],
    ]);
    expect(texto(ms[1]!.precoUsdt)).toBe("600");
  });

  it("taxa em BNB sem conversão: o BNB ainda é consumido, sem preço", () => {
    const ms = movimentosDe(
      negociacao({ preco: "100", quantidade: "1", taxa: "0.001", ativoTaxa: "BNB", taxaUsdt: null }),
    );
    expect(ms[0]!.taxaUsdt).toBeNull();
    expect(ms[1]!.precoUsdt).toBeNull();
  });

  it("par sem USDT (ETHBTC): compra ETH e vende o BTC pago, os dois em USDT do instante", () => {
    const ms = movimentosDe(
      negociacao({
        base: "ETH",
        cotacao: "BTC",
        preco: "0.05",
        quantidade: "2",
        taxa: "0.0001",
        ativoTaxa: "BTC",
        cotacaoUsdt: "60000",
        taxaUsdt: "6",
      }),
    );
    expect(
      ms.map((m) => [m.ativo, m.tipo, texto(m.quantidade), texto(m.precoUsdt), texto(m.taxaUsdt)]),
    ).toEqual([
      ["ETH", "compra", "2", "3000", "6"],
      ["BTC", "venda", "0.1001", "60000", "0"],
    ]);
  });

  it("venda em par sem USDT: recebe a cotação menos a taxa paga nela", () => {
    const ms = movimentosDe(
      negociacao({
        lado: "VENDA",
        base: "ETH",
        cotacao: "BTC",
        preco: "0.05",
        quantidade: "2",
        taxa: "0.0001",
        ativoTaxa: "BTC",
        cotacaoUsdt: "60000",
      }),
    );
    expect(ms.map((m) => [m.ativo, m.tipo, texto(m.quantidade)])).toEqual([
      ["ETH", "venda", "2"],
      ["BTC", "compra", "0.0999"],
    ]);
  });

  it("par com USDT na base (USDTBRL): só o BRL mexe e leva a taxa", () => {
    const ms = movimentosDe(
      negociacao({
        base: "USDT",
        cotacao: "BRL",
        preco: "5",
        quantidade: "10",
        taxa: "0.01",
        ativoTaxa: "USDT",
        cotacaoUsdt: "0.2",
        taxaUsdt: "0.01",
      }),
    );
    expect(ms.map((m) => [m.ativo, m.tipo, texto(m.quantidade), texto(m.taxaUsdt)])).toEqual([
      ["BRL", "venda", "50", "0.01"],
    ]);
  });

  it("sem cotação em USDT, os movimentos saem sem preço (ficam fora do cálculo)", () => {
    const [m] = movimentosDe(
      negociacao({ cotacao: "FDUSD", preco: "50000", quantidade: "1", cotacaoUsdt: null, taxaUsdt: null }),
    );
    expect(m!.precoUsdt).toBeNull();
  });

  it("quantidade que zera depois da taxa não vira movimento", () => {
    const ms = movimentosDe(
      negociacao({ preco: "1", quantidade: "1", taxa: "1", ativoTaxa: "BTC", taxaUsdt: "1" }),
    );
    expect(ms).toEqual([]);
  });
});
