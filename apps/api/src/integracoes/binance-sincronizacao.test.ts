import { ErroCorretora, ErroLimiteRequisicoes, type NegociacaoBruta } from "@zentrade/corretora";
import { dec } from "@zentrade/dominio";
import { describe, expect, it, vi } from "vitest";
import { carteiraEmMemoria } from "../integracao/carteira-memoria.js";
import type { ContaLeitura } from "./binance-conta.js";
import { sincronizarConta, type PedidoConta } from "./binance-sincronizacao.js";

const U = "22222222-2222-4222-8222-222222222222";
const PEDIDO: PedidoConta = { usuarioId: U, rede: "testnet", extras: [], robos: [] };

const bruta = (simbolo: string, id: number): NegociacaoBruta => ({
  simbolo,
  id,
  orderId: id,
  preco: dec(10),
  quantidade: dec(1),
  valorCotacao: dec(10),
  taxa: dec("0.01"),
  ativoTaxa: "USDT",
  em: id,
  isBuyer: true,
});

function contaFalsa(
  negociacoes: (simbolo: string, desde: number) => Promise<NegociacaoBruta[]>,
): ContaLeitura {
  return {
    conta: async () => ({
      podeNegociar: true,
      saldos: [
        { ativo: "BTC", livre: dec(1), bloqueado: dec(0) },
        { ativo: "ETH", livre: dec(1), bloqueado: dec(0) },
        { ativo: "SOL", livre: dec(1), bloqueado: dec(0) },
      ],
    }),
    pares: async () =>
      new Map([
        ["BTCUSDT", { base: "BTC", cotacao: "USDT" }],
        ["ETHUSDT", { base: "ETH", cotacao: "USDT" }],
        ["SOLUSDT", { base: "SOL", cotacao: "USDT" }],
      ]),
    negociacoes: vi.fn(negociacoes),
    idsCliente: async () => new Map(),
    precoHistoricoUsdt: async () => null,
    tabelaPrecos: async () => new Map(),
    restricoes: async () => null,
  } as unknown as ContaLeitura;
}

describe("sincronização de uma conta", () => {
  it("par recusado pela Binance segue para os outros; 429 para tudo e sai parcial", async () => {
    const carteira = carteiraEmMemoria();
    const conta = contaFalsa(async (simbolo) => {
      if (simbolo === "BTCUSDT") return [bruta(simbolo, 1)];
      if (simbolo === "ETHUSDT") throw new ErroCorretora("par fora de negociação", -1121);
      throw new ErroLimiteRequisicoes("limite", 1000, false);
    });
    const r = await sincronizarConta({ conta, carteira, agora: () => 5 }, PEDIDO);
    expect(r).toMatchObject({ negociacoesNovas: 1, parcial: true, saldos: 3 });
    expect(r.avisos.join(" ")).toMatch(/ETHUSDT: par fora[\s\S]*Parou em SOLUSDT/);
    expect(await carteira.sincronizacao(U, "testnet")).toMatchObject({ ok: false, simbolos: ["BTCUSDT"] });
    expect((await carteira.saldos(U, "testnet")).map((s) => s.ativo)).toEqual(["BTC", "ETH", "SOL"]);
  });

  it("continua de onde parou: pede só depois do último id importado", async () => {
    const carteira = carteiraEmMemoria();
    const conta = contaFalsa(async (simbolo, desde) =>
      simbolo === "BTCUSDT" && desde === 0 ? [bruta(simbolo, 4)] : [],
    );
    await sincronizarConta({ conta, carteira, agora: () => 1 }, PEDIDO);
    await sincronizarConta({ conta, carteira, agora: () => 2 }, PEDIDO);
    expect(
      vi
        .mocked(conta.negociacoes)
        .mock.calls.filter(([s]) => s === "BTCUSDT")
        .map(([, d]) => d),
    ).toEqual([0, 5]);
  });

  it("chave recusada logo na leitura da conta: registra a falha e explica", async () => {
    const carteira = carteiraEmMemoria();
    const conta = contaFalsa(async () => []);
    conta.conta = async () => {
      throw new ErroCorretora("A Binance recusou a requisição (código -2015: Invalid API-key).", -2015);
    };
    await expect(sincronizarConta({ conta, carteira, agora: () => 9 }, PEDIDO)).rejects.toMatchObject({
      statusCode: 502,
      codigo: "binance_recusou",
    });
    expect(await carteira.sincronizacao(U, "testnet")).toMatchObject({ ok: false, em: 9 });
  });
});
