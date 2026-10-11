import type { EstadoConexao } from "@zentrade/contratos";
import { dec, type Candle } from "@zentrade/dominio";
import { describe, expect, it } from "vitest";
import { PapelCorretora } from "./papel.js";

const candle = (abertura: number, fecha: string): Candle => ({
  abertura,
  fechamento: abertura + 59_999,
  abre: dec(fecha),
  maxima: dec(fecha),
  minima: dec(fecha),
  fecha: dec(fecha),
  volume: dec(1),
});

function criar(saldoUsdt = "1000") {
  const papel = new PapelCorretora({
    saldos: { USDT: dec(saldoUsdt) },
    taxa: 0.001,
    deslizamentoBps: 10,
    agora: () => 5_000,
  });
  papel.alimentar("BTCUSDT", "1m", candle(0, "100"));
  return papel;
}

describe("PapelCorretora", () => {
  it("é da rede papel", () => {
    expect(criar().rede).toBe("papel");
  });

  it("compra no último preço + deslizamento e cobra a taxa", async () => {
    const papel = criar();
    const r = await papel.enviarOrdemMercado({
      simbolo: "BTCUSDT",
      lado: "COMPRA",
      quantidade: dec(1),
      idCliente: "a",
    });
    expect(r.estado).toBe("PREENCHIDA");
    const ex = r.execucoes[0]!;
    expect(ex.preco.equals(dec("100.1"))).toBe(true);
    expect(ex.quantidade.equals(dec(1))).toBe(true);
    expect(ex.taxaCotacao.equals(dec("0.1001"))).toBe(true);
    expect(ex.em).toBe(5_000);
    expect((await papel.saldoLivre("USDT")).equals(dec("899.7999"))).toBe(true);
    expect((await papel.saldoLivre("BTC")).equals(dec(1))).toBe(true);
  });

  it("vende no último preço − deslizamento", async () => {
    const papel = criar();
    await papel.enviarOrdemMercado({
      simbolo: "BTCUSDT",
      lado: "COMPRA",
      quantidade: dec(1),
      idCliente: "a",
    });
    papel.alimentar("BTCUSDT", "1m", candle(60_000, "110"));
    const r = await papel.enviarOrdemMercado({
      simbolo: "BTCUSDT",
      lado: "VENDA",
      quantidade: dec(1),
      idCliente: "b",
    });
    expect(r.execucoes[0]!.preco.equals(dec("109.89"))).toBe(true);
    expect((await papel.saldoLivre("BTC")).isZero()).toBe(true);
    // 899,7999 + 109,89 − 0,10989
    expect((await papel.saldoLivre("USDT")).equals(dec("1009.58001"))).toBe(true);
  });

  it("mesmo idCliente não executa duas vezes", async () => {
    const papel = criar();
    const pedido = { simbolo: "BTCUSDT", lado: "COMPRA" as const, quantidade: dec(1), idCliente: "a" };
    const r1 = await papel.enviarOrdemMercado(pedido);
    const r2 = await papel.enviarOrdemMercado(pedido);
    expect(r2).toBe(r1);
    expect((await papel.saldoLivre("BTC")).equals(dec(1))).toBe(true);
    expect(await papel.consultarOrdem("BTCUSDT", "a")).toBe(r1);
    expect(await papel.consultarOrdem("BTCUSDT", "nada")).toBeNull();
  });

  it("rejeita saldo insuficiente, quantidade fora dos filtros e falta de preço", async () => {
    const papel = criar("50");
    const enviar = (quantidade: string, lado: "COMPRA" | "VENDA" = "COMPRA", simbolo = "BTCUSDT") =>
      papel.enviarOrdemMercado({
        simbolo,
        lado,
        quantidade: dec(quantidade),
        idCliente: `${lado}-${quantidade}-${simbolo}`,
      });
    const semSaldo = await enviar("1");
    expect(semSaldo.estado).toBe("REJEITADA");
    expect(semSaldo.motivo).toMatch(/saldo/i);
    expect((await enviar("1", "VENDA")).motivo).toMatch(/BTC/);
    expect((await enviar("0.000001")).motivo).toMatch(/passo|mínim/);
    expect((await enviar("0.01")).motivo).toMatch(/US\$/);
    expect((await enviar("0")).motivo).toMatch(/maior que zero/);
    expect((await enviar("1", "COMPRA", "ETHUSDT")).motivo).toMatch(/preço/);
    expect((await papel.saldoLivre("USDT")).equals(dec(50))).toBe(true);
  });

  it("candles alimentados: históricos sem duplicata, fim exclusivo", async () => {
    const papel = criar();
    papel.alimentar("BTCUSDT", "1m", candle(60_000, "101"));
    papel.alimentar("BTCUSDT", "1m", candle(60_000, "101"));
    papel.alimentar("BTCUSDT", "1m", candle(120_000, "102"));
    const todos = await papel.candles("BTCUSDT", "1m", 10);
    expect(todos.map((c) => c.abertura)).toEqual([0, 60_000, 120_000]);
    const ate = await papel.candles("BTCUSDT", "1m", 1, 120_000);
    expect(ate.map((c) => c.abertura)).toEqual([60_000]);
    expect(await papel.candles("BTCUSDT", "5m", 10)).toEqual([]);
  });

  it("entrega candles a quem assina e simula queda e volta da conexão", async () => {
    const papel = criar();
    const recebidos: number[] = [];
    const estados: EstadoConexao[] = [];
    const parar = papel.assinarCandles(
      "BTCUSDT",
      "1m",
      (c) => recebidos.push(c.abertura),
      (e) => estados.push(e),
    );
    papel.alimentar("BTCUSDT", "1m", candle(60_000, "101"));
    papel.alimentar("BTCUSDT", "5m", candle(60_000, "101"));
    papel.desconectar();
    papel.alimentar("BTCUSDT", "1m", candle(120_000, "102"));
    papel.reconectar();
    papel.alimentar("BTCUSDT", "1m", candle(180_000, "103"));
    parar();
    papel.alimentar("BTCUSDT", "1m", candle(240_000, "104"));
    expect(recebidos).toEqual([60_000, 180_000]);
    expect(estados).toEqual(["conectado", "reconectando", "conectado", "desconectado"]);
    // o candle perdido na queda continua no histórico para o backfill
    expect((await papel.candles("BTCUSDT", "1m", 10)).map((c) => c.abertura)).toContain(120_000);
  });

  it("livro sintético em volta do último preço e filtros configuráveis", async () => {
    const filtros = {
      passoQuantidade: dec("0.1"),
      quantidadeMinima: dec("0.1"),
      valorMinimo: dec(1),
      passoPreco: dec("0.01"),
    };
    const papel = new PapelCorretora({ saldos: {}, taxa: 0, deslizamentoBps: 0, filtros });
    expect(await papel.filtros("BTCUSDT")).toBe(filtros);
    await expect(papel.livro("BTCUSDT", 5)).rejects.toThrow(/preço/);
    papel.definirPreco("BTCUSDT", dec(100));
    const livro = await papel.livro("BTCUSDT", 5);
    expect(livro.compras[0]!.preco.equals(dec(100))).toBe(true);
    expect(livro.vendas[0]!.preco.equals(dec(100))).toBe(true);
  });

  it("filtros por símbolo (ex.: os reais da Binance no papel ao vivo) valem na validação", async () => {
    const papel = criar();
    papel.definirFiltros("BTCUSDT", {
      passoQuantidade: dec(1),
      quantidadeMinima: dec(1),
      valorMinimo: dec(5),
      passoPreco: dec("0.01"),
    });
    expect((await papel.filtros("BTCUSDT")).passoQuantidade.equals(dec(1))).toBe(true);
    expect((await papel.filtros("ETHUSDT")).passoQuantidade.equals(dec("0.00001"))).toBe(true);
    const r = await papel.enviarOrdemMercado({
      simbolo: "BTCUSDT",
      lado: "COMPRA",
      quantidade: dec("1.5"),
      idCliente: "f",
    });
    expect(r.motivo).toMatch(/passo/);
  });

  it("recusa configuração impossível", () => {
    expect(() => new PapelCorretora({ saldos: {}, taxa: -1, deslizamentoBps: 0 })).toThrow(/taxa/);
    expect(() => new PapelCorretora({ saldos: {}, taxa: 0, deslizamentoBps: -1 })).toThrow(/deslizamento/);
  });

  it("restaura os saldos a partir de execuções já gravadas (papel com banco, depois de reiniciar)", async () => {
    const papel = new PapelCorretora({ saldos: { USDT: dec(1000) }, taxa: 0.001, deslizamentoBps: 0 });
    papel.restaurarExecucoes("BTCUSDT", [
      { lado: "COMPRA", preco: dec(100), quantidade: dec(2), taxaCotacao: dec("0.2"), em: 1 },
      { lado: "VENDA", preco: dec(110), quantidade: dec(1), taxaCotacao: dec("0.11"), em: 2 },
    ]);
    expect((await papel.saldoLivre("BTC")).toFixed()).toBe("1");
    expect((await papel.saldoLivre("USDT")).toFixed()).toBe("909.69"); // 1000 - 200,2 + 110 - 0,11
    papel.restaurarExecucoes("BTCUSDT", []);
    expect((await papel.saldoLivre("BTC")).toFixed()).toBe("1");
  });
});
