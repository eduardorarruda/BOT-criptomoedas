import { dec, type Valor } from "@zentrade/dominio";
import { describe, expect, it, vi } from "vitest";
import type { NegociacaoBruta } from "../conta-binance.js";
import { importarNegociacoes, origemDe, type FonteImportacao } from "./importar.js";

const bruta = (id: number, extra: Partial<NegociacaoBruta> = {}): NegociacaoBruta => ({
  simbolo: "BTCUSDT",
  id,
  orderId: 10 + id,
  preco: dec("50000"),
  quantidade: dec("0.01"),
  valorCotacao: dec("500"),
  taxa: dec("0.5"),
  ativoTaxa: "USDT",
  em: 1_000 + id,
  isBuyer: true,
  ...extra,
});

function fonte(precos: Record<string, string | null>, ids: Record<number, string>): FonteImportacao {
  return {
    precoHistoricoUsdt: vi.fn(async (ativo: string): Promise<Valor | null> => {
      const p = precos[ativo];
      return p ? dec(p) : null;
    }),
    idsCliente: vi.fn(async () => new Map(Object.entries(ids).map(([k, v]) => [Number(k), v]))),
  };
}

describe("importar negociações da Binance", () => {
  it("origem: robô quando o clientOrderId começa com zt-, senão manual", () => {
    expect(origemDe("zt-abc")).toBe("robo");
    expect(origemDe("web_123")).toBe("manual");
    expect(origemDe(null)).toBe("manual");
  });

  it("par em USDT: cotação 1, taxa em USDT, origem pelo clientOrderId", async () => {
    const f = fonte({}, { 11: "zt-x", 12: "and_y" });
    const ns = await importarNegociacoes(f, { base: "BTC", cotacao: "USDT" }, [
      bruta(1),
      bruta(2, { isBuyer: false }),
    ]);
    expect(
      ns.map((n) => [n.id, n.lado, n.origem, n.idCliente, n.cotacaoUsdt?.toFixed(), n.taxaUsdt?.toFixed()]),
    ).toEqual([
      ["BTCUSDT:1", "COMPRA", "robo", "zt-x", "1", "0.5"],
      ["BTCUSDT:2", "VENDA", "manual", "and_y", "1", "0.5"],
    ]);
    expect(f.idsCliente).toHaveBeenCalledWith("BTCUSDT", 11, 12);
    expect(f.precoHistoricoUsdt).not.toHaveBeenCalled();
  });

  it("taxa em BNB: converte pelo preço do BNB no instante da negociação", async () => {
    const f = fonte({ BNB: "600" }, {});
    const [n] = await importarNegociacoes(f, { base: "BTC", cotacao: "USDT" }, [
      bruta(1, { taxa: dec("0.001"), ativoTaxa: "BNB" }),
    ]);
    expect(n!.taxaUsdt?.toFixed()).toBe("0.6");
    expect(f.precoHistoricoUsdt).toHaveBeenCalledWith("BNB", 1_001);
  });

  it("par sem USDT: busca a cotação em USDT do instante; sem ela, fica sem conversão", async () => {
    const com = await importarNegociacoes(fonte({ BTC: "60000" }, {}), { base: "ETH", cotacao: "BTC" }, [
      bruta(1, {
        simbolo: "ETHBTC",
        preco: dec("0.05"),
        valorCotacao: dec("0.0005"),
        taxa: dec("0.0000005"),
        ativoTaxa: "BTC",
      }),
    ]);
    expect([com[0]!.cotacaoUsdt?.toFixed(), com[0]!.taxaUsdt?.toFixed()]).toEqual(["60000", "0.03"]);
    const sem = await importarNegociacoes(fonte({}, {}), { base: "ETH", cotacao: "BTC" }, [
      bruta(1, { simbolo: "ETHBTC", ativoTaxa: "BTC" }),
    ]);
    expect([sem[0]!.cotacaoUsdt, sem[0]!.taxaUsdt]).toEqual([null, null]);
  });

  it("sem negociações, não pergunta nada à Binance", async () => {
    const f = fonte({}, {});
    expect(await importarNegociacoes(f, { base: "BTC", cotacao: "USDT" }, [])).toEqual([]);
    expect(f.idsCliente).not.toHaveBeenCalled();
  });
});
