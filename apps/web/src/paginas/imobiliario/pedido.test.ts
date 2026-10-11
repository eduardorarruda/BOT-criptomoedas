import { NovoInvestimentoImobiliarioEsquema } from "@zentrade/contratos/esquemas";
import { describe, expect, it } from "vitest";
import { CAMPOS_POR_TIPO, montarPedido } from "./pedido";

describe("montar o pedido de cadastro a partir do formulário", () => {
  it("imóvel financiado: entrada = compra − financiado, custos viram lançamentos", () => {
    const r = montarPedido("aluguel", {
      nome: "Apto",
      dataCompra: "2026-01-10",
      valorCompra: "500.000,00",
      itbi: "15.000",
      escritura: "",
      aluguelPrevisto: "2.800",
      taxaAdministracao: "8",
      financiado: "sim",
      sistema: "SAC",
      valorFinanciado: "350000",
      taxaAnual: "11,49",
      prazoFinanciamento: "360",
      primeiraParcela: "2026-02-10",
    });
    expect(r.erros).toEqual({});
    expect(NovoInvestimentoImobiliarioEsquema.safeParse(r.pedido).success).toBe(true);
    expect(r.pedido).toMatchObject({
      tipo: "aluguel",
      nome: "Apto",
      aluguelPrevisto: "2800",
      taxaAdministracao: 0.08,
      financiamento: { sistema: "SAC", valorFinanciado: "350000", prazoMeses: 360 },
    });
    expect(r.pedido!.financiamento!.taxaAnual).toBeCloseTo(0.1149, 12);
    expect(r.pedido!.lancamentosIniciais).toEqual([
      { data: "2026-01-10", tipo: "aporte", categoria: "entrada", valor: "150000" },
      { data: "2026-01-10", tipo: "aporte", categoria: "itbi", valor: "15000" },
    ]);
  });

  it("aponta cada campo com problema, com mensagem para a pessoa", () => {
    const r = montarPedido("aluguel", {
      nome: "",
      dataCompra: "10/01/2026",
      valorCompra: "abc",
      financiado: "sim",
      valorFinanciado: "900000",
      taxaAnual: "",
      prazoFinanciamento: "0",
      primeiraParcela: "",
    });
    expect(r.pedido).toBeNull();
    expect(Object.keys(r.erros).sort()).toEqual(
      ["dataCompra", "nome", "prazoFinanciamento", "primeiraParcela", "taxaAnual", "valorCompra"].sort(),
    );
  });

  it("financiado acima do valor de compra é recusado", () => {
    const r = montarPedido("terreno", {
      nome: "Lote",
      dataCompra: "2026-01-10",
      valorCompra: "100000",
      financiado: "sim",
      sistema: "PRICE",
      valorFinanciado: "150000",
      taxaAnual: "10",
      prazoFinanciamento: "120",
      primeiraParcela: "2026-02-10",
    });
    expect(r.erros.valorFinanciado).toMatch(/compra/);
  });

  it("FII: compra com quantidade e ticker", () => {
    const r = montarPedido("fii", {
      nome: "Logística",
      ticker: "hglg11",
      dataCompra: "2026-01-05",
      cotas: "50",
      valorCompra: "7.900,50",
      valorAtual: "160,10",
    });
    expect(r.erros).toEqual({});
    expect(r.pedido).toMatchObject({ tipo: "fii", ticker: "hglg11", valorAtual: "160.1" });
    expect(r.pedido!.lancamentosIniciais![0]).toMatchObject({
      categoria: "compra",
      quantidade: "50",
      valor: "7900.5",
    });
  });

  it("REIT exige câmbio e vai em dólar", () => {
    const sem = montarPedido("reit", {
      nome: "O",
      ticker: "O",
      dataCompra: "2026-01-05",
      cotas: "10",
      valorCompra: "570",
    });
    expect(sem.erros.cambio).toBeDefined();
    const com = montarPedido("reit", {
      nome: "O",
      ticker: "O",
      dataCompra: "2026-01-05",
      cotas: "10",
      valorCompra: "570",
      cambio: "5,40",
    });
    expect(com.pedido).toMatchObject({ moeda: "USD" });
    expect(com.pedido!.lancamentosIniciais![0]).toMatchObject({ cambio: "5.4" });
  });

  it("consórcio e temporada levam os parâmetros do tipo", () => {
    const c = montarPedido("consorcio", {
      nome: "Carta",
      valorCarta: "250000",
      prazoMeses: "180",
      taxaAdministracao: "17",
      fundoReserva: "2",
    });
    expect(c.erros).toEqual({});
    expect(c.pedido).toMatchObject({ valorCarta: "250000", prazoMeses: 180, fundoReserva: 0.02 });
    const t = montarPedido("temporada", {
      nome: "Studio",
      dataCompra: "2026-01-10",
      valorCompra: "300000",
      diaria: "290",
      ocupacao: "55",
      taxaPlataforma: "15",
    });
    expect(t.pedido).toMatchObject({ diaria: "290", ocupacao: 0.55, taxaPlataforma: 0.15 });
  });

  it("cada tipo declara os seus campos", () => {
    expect(CAMPOS_POR_TIPO.fii.map((c) => c.chave)).toContain("ticker");
    expect(CAMPOS_POR_TIPO.planta.map((c) => c.chave)).toContain("dataEntrega");
  });
});
