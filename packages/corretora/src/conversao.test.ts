import { dec } from "@zentrade/dominio";
import { describe, expect, it } from "vitest";
import { candleDeKline, estadoDaOrdem, execucoesDosFills, filtrosDoSimbolo } from "./conversao.js";
import { ErroCorretora } from "./erros.js";

const ATIVOS = { base: "BTC", cotacao: "USDT" };

describe("filtros do símbolo", () => {
  it("lê LOT_SIZE, NOTIONAL e PRICE_FILTER", () => {
    const f = filtrosDoSimbolo([
      { filterType: "PRICE_FILTER", tickSize: "0.01000000" },
      { filterType: "LOT_SIZE", minQty: "0.00001000", maxQty: "9000.00000000", stepSize: "0.00001000" },
      { filterType: "NOTIONAL", minNotional: "5.00000000" },
    ]);
    expect(f.passoQuantidade.equals(dec("0.00001"))).toBe(true);
    expect(f.quantidadeMinima.equals(dec("0.00001"))).toBe(true);
    expect(f.quantidadeMaxima?.equals(dec(9000))).toBe(true);
    expect(f.valorMinimo.equals(dec(5))).toBe(true);
    expect(f.passoPreco.equals(dec("0.01"))).toBe(true);
  });

  it("aceita o MIN_NOTIONAL antigo quando não há NOTIONAL", () => {
    const f = filtrosDoSimbolo([
      { filterType: "PRICE_FILTER", tickSize: "0.1" },
      { filterType: "LOT_SIZE", minQty: "0.1", maxQty: "0", stepSize: "0.1" },
      { filterType: "MIN_NOTIONAL", minNotional: "10" },
    ]);
    expect(f.valorMinimo.equals(dec(10))).toBe(true);
    // maxQty 0 = sem máximo
    expect(f.quantidadeMaxima).toBeUndefined();
  });

  it("sem LOT_SIZE não dá para operar: erro explica o que falta", () => {
    expect(() => filtrosDoSimbolo([{ filterType: "PRICE_FILTER", tickSize: "0.1" }])).toThrow(/LOT_SIZE/);
  });
});

describe("candle da kline", () => {
  it("converte a linha da /api/v3/klines em decimais exatos", () => {
    const c = candleDeKline([1000, "1.5", "2", "1", "1.75", "10.1", 1999]);
    expect(c.abertura).toBe(1000);
    expect(c.fechamento).toBe(1999);
    expect(c.fecha.equals(dec("1.75"))).toBe(true);
    expect(c.volume.equals(dec("10.1"))).toBe(true);
  });
});

describe("execuções a partir dos fills", () => {
  const em = 1_700_000_000_000;

  it("taxa no ativo base: desconta da quantidade e converte a taxa pelo preço do fill", () => {
    const r = execucoesDosFills(
      "COMPRA",
      [{ price: "100", qty: "1", commission: "0.001", commissionAsset: "BTC" }],
      ATIVOS,
      0.001,
      em,
    );
    expect(r.execucoes).toHaveLength(1);
    const ex = r.execucoes[0]!;
    expect(ex.quantidade.equals(dec("0.999"))).toBe(true);
    expect(ex.taxaCotacao.equals(dec("0.1"))).toBe(true);
    expect(ex.preco.equals(dec(100))).toBe(true);
    expect(r.motivo).toBeUndefined();
  });

  it("taxa na cotação: usa direto e mantém a quantidade", () => {
    const r = execucoesDosFills(
      "VENDA",
      [
        { price: "100", qty: "0.5", commission: "0.05", commissionAsset: "USDT" },
        { price: "101", qty: "0.5", commission: "0.0505", commissionAsset: "USDT" },
      ],
      ATIVOS,
      0.001,
      em,
    );
    expect(r.execucoes.map((e) => e.quantidade.toFixed())).toEqual(["0.5", "0.5"]);
    expect(r.execucoes[1]!.taxaCotacao.equals(dec("0.0505"))).toBe(true);
  });

  it("taxa em outro ativo (BNB): estima pela taxa configurada e diz isso no motivo", () => {
    const r = execucoesDosFills(
      "COMPRA",
      [{ price: "200", qty: "2", commission: "0.0003", commissionAsset: "BNB" }],
      ATIVOS,
      0.00075,
      em,
    );
    expect(r.execucoes[0]!.taxaCotacao.equals(dec("0.3"))).toBe(true);
    expect(r.execucoes[0]!.quantidade.equals(dec(2))).toBe(true);
    expect(r.motivo).toMatch(/BNB/);
    expect(r.motivo).toMatch(/estimad/);
  });

  it("venda com taxa no ativo base mantém a quantidade vendida", () => {
    const r = execucoesDosFills(
      "VENDA",
      [{ price: "100", qty: "1", commission: "0.001", commissionAsset: "BTC" }],
      ATIVOS,
      0.001,
      em,
    );
    expect(r.execucoes[0]!.quantidade.equals(dec(1))).toBe(true);
    expect(r.execucoes[0]!.taxaCotacao.equals(dec("0.1"))).toBe(true);
  });
});

describe("estado da ordem", () => {
  it("traduz os estados da Binance", () => {
    expect(estadoDaOrdem("FILLED", dec(1))).toBe("PREENCHIDA");
    expect(estadoDaOrdem("NEW", dec(0))).toBe("PENDENTE");
    expect(estadoDaOrdem("PARTIALLY_FILLED", dec("0.1"))).toBe("PARCIAL");
    expect(estadoDaOrdem("REJECTED", dec(0))).toBe("REJEITADA");
    expect(estadoDaOrdem("EXPIRED", dec(0))).toBe("CANCELADA");
    // mercado com liquidez parcial: a Binance expira o resto, mas parte executou
    expect(estadoDaOrdem("EXPIRED", dec("0.3"))).toBe("PARCIAL");
    expect(estadoDaOrdem("CANCELED", dec(0))).toBe("CANCELADA");
  });

  it("estado desconhecido vira erro explicado", () => {
    expect(() => estadoDaOrdem("ESTRANHO", dec(0))).toThrow(ErroCorretora);
  });
});
