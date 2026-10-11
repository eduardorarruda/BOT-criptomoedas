import { describe, expect, it } from "vitest";
import {
  CarteiraEsquema,
  MOEDA_REFERENCIA,
  NegociacaoCarteiraEsquema,
  PedidoSincronizacaoEsquema,
  StatusBinanceEsquema,
} from "./esquemas.js";

const parcela = {
  quantidadeComprada: "1",
  custoComprado: "100",
  quantidadeVendida: "0",
  valorVendido: "0",
  quantidade: "1",
  precoMedio: "100",
  custoPosicao: "100",
  valorAtual: null,
  resultadoRealizadoBruto: "0",
  resultadoRealizadoLiquido: "-0.1",
  resultadoNaoRealizado: null,
  resultadoLiquido: null,
  taxas: "0.1",
  retorno: null,
  quantidadeVendidaSemCusto: "0",
  negociacoes: 1,
  semConversao: 0,
};

const resumoParcela = {
  custoComprado: "0",
  custoPosicao: "0",
  valorAtual: "0",
  resultadoRealizadoBruto: "0",
  resultadoRealizadoLiquido: "0",
  resultadoNaoRealizado: "0",
  resultadoBruto: "0",
  resultadoLiquido: "0",
  taxas: "0",
  retorno: null,
};

describe("contrato da carteira", () => {
  it("carteira sem conta: desconectada, sem moedas, mas com o resumo zerado", () => {
    const vazia = {
      conectada: false,
      rede: null,
      redes: [],
      moedaReferencia: MOEDA_REFERENCIA,
      sincronizacao: null,
      precosEm: null,
      resumo: {
        robo: resumoParcela,
        manual: resumoParcela,
        total: resumoParcela,
        valorConta: "0",
        valorSemCusto: "0",
        caixa: "0",
      },
      moedas: [],
      avisos: [],
    };
    expect(CarteiraEsquema.parse(vazia).conectada).toBe(false);
    expect(CarteiraEsquema.safeParse({ ...vazia, moedaReferencia: "BRL" }).success).toBe(false);
  });

  it("moeda aceita preço desconhecido, mas nunca dinheiro em número JSON", () => {
    const moeda = {
      ativo: "BTC",
      preco: null,
      referencia: false,
      saldo: { livre: "1", bloqueado: "0", total: "1" },
      valorSaldo: null,
      quantidadeSemCusto: "0",
      valorSemCusto: null,
      quantidadeForaDoSaldo: "0",
      alocacao: null,
      robo: parcela,
      manual: parcela,
      total: parcela,
      avisos: [],
    };
    const base = CarteiraEsquema.shape.moedas.element;
    expect(base.safeParse(moeda).success).toBe(true);
    expect(base.safeParse({ ...moeda, total: { ...parcela, custoPosicao: 100 } }).success).toBe(false);
  });

  it("negociação traz a origem e a taxa convertida (ou null)", () => {
    const n = {
      id: "BTCUSDT:1",
      simbolo: "BTCUSDT",
      base: "BTC",
      cotacao: "USDT",
      lado: "COMPRA",
      preco: "50000",
      quantidade: "0.01",
      valorCotacao: "500",
      taxa: "0.0001",
      ativoTaxa: "BNB",
      taxaUsdt: null,
      cotacaoUsdt: "1",
      origem: "robo",
      idOrdem: "42",
      em: 1,
    };
    expect(NegociacaoCarteiraEsquema.safeParse(n).success).toBe(true);
    expect(NegociacaoCarteiraEsquema.safeParse({ ...n, origem: "outro" }).success).toBe(false);
  });

  it("pedido de sincronização: pares em maiúsculas, no máximo 50", () => {
    expect(PedidoSincronizacaoEsquema.parse({}).simbolos).toBeUndefined();
    expect(PedidoSincronizacaoEsquema.safeParse({ simbolos: ["btcusdt"] }).success).toBe(false);
    expect(PedidoSincronizacaoEsquema.safeParse({ rede: "papel" }).success).toBe(false);
    expect(PedidoSincronizacaoEsquema.safeParse({ simbolos: Array(51).fill("BTCUSDT") }).success).toBe(false);
  });

  it("status: permissões desconhecidas viram null, não false", () => {
    const conta = {
      id: "c1",
      rede: "testnet",
      apiKeyFinal: "…abcd",
      conectada: true,
      erro: null,
      podeNegociar: true,
      podeSacar: null,
      ipRestrito: null,
      permissoesLidas: false,
      sincronizacao: { em: 1, ok: true, erro: null, negociacoes: 3 },
      avisos: ["a testnet não informa as permissões da chave"],
    };
    expect(StatusBinanceEsquema.parse({ contas: [conta] }).contas[0]!.podeSacar).toBeNull();
  });
});
