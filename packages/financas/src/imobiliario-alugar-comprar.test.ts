import { dec } from "@zentrade/dominio";
import { describe, expect, it } from "vitest";
import { ErroParametroFinanceiro, taxaAnualDeMensal } from "./fluxo-caixa.js";
import { alugarOuComprar, type ParametrosAlugarComprar } from "./imobiliario-alugar-comprar.js";

const semFinanciamento: ParametrosAlugarComprar = {
  valorImovel: dec(100000),
  entrada: dec(100000),
  custosCompra: dec(0),
  aluguelMensal: dec(500),
  reajusteAnual: 0,
  custosProprietarioMensais: dec(0),
  valorizacaoAnual: 0,
  taxaOportunidadeAnual: 0,
  horizonteMeses: 12,
};

describe("alugar × comprar", () => {
  it("sem juros nem valorização: quem compra guarda o aluguel que não paga", () => {
    const r = alugarOuComprar(semFinanciamento);
    expect(r.meses).toHaveLength(12);
    expect(r.final.comprar.toFixed(2)).toBe("106000.00");
    expect(r.final.alugar.toFixed(2)).toBe("100000.00");
    expect(r.final.diferenca.toFixed(2)).toBe("6000.00");
    expect(r.final.maiorPatrimonio).toBe("comprar");
  });

  it("custo de oportunidade: o dinheiro da compra aplicado a 1% a.m. rende 12,68% no ano", () => {
    const r = alugarOuComprar({
      ...semFinanciamento,
      aluguelMensal: dec(0),
      taxaOportunidadeAnual: taxaAnualDeMensal(0.01),
    });
    expect(r.final.alugar.toFixed(2)).toBe("112682.50");
    expect(r.final.comprar.toFixed(2)).toBe("100000.00");
    expect(r.final.maiorPatrimonio).toBe("alugar");
  });

  it("com financiamento: quem aluga aplica a diferença entre parcela e aluguel", () => {
    const r = alugarOuComprar({
      ...semFinanciamento,
      entrada: dec(20000),
      aluguelMensal: dec(1000),
      horizonteMeses: 10,
      financiamento: { sistema: "PRICE", taxaAnual: 0, prazoMeses: 10 },
    });
    expect(r.meses[0]!.gastoComprar.toFixed(2)).toBe("8000.00");
    expect(r.meses[0]!.saldoDevedor.toFixed(2)).toBe("72000.00");
    expect(r.final.comprar.toFixed(2)).toBe("100000.00");
    expect(r.final.alugar.toFixed(2)).toBe("90000.00");
  });

  it("aponta o primeiro mês em que o patrimônio de quem compra alcança o de quem aluga", () => {
    const r = alugarOuComprar({
      ...semFinanciamento,
      custosCompra: dec(3000),
      aluguelMensal: dec(1000),
      horizonteMeses: 24,
    });
    // começa 3.000 atrás (ITBI e registro) e recupera 1.000 por mês
    expect(r.meses[1]!.patrimonioComprar.lt(r.meses[1]!.patrimonioAlugar)).toBe(true);
    expect(r.mesEmQueComprarAlcanca).toBe(3);
  });

  it("aluguel e custos do proprietário reajustam uma vez por ano", () => {
    const r = alugarOuComprar({
      ...semFinanciamento,
      reajusteAnual: 0.1,
      custosProprietarioMensais: dec(100),
      horizonteMeses: 13,
    });
    expect(r.meses[11]!.gastoAlugar.toFixed(2)).toBe("500.00");
    expect(r.meses[12]!.gastoAlugar.toFixed(2)).toBe("550.00");
    expect(r.meses[12]!.gastoComprar.toFixed(2)).toBe("110.00");
  });

  it("valoriza o imóvel e desconta a corretagem de venda no fim", () => {
    const r = alugarOuComprar({
      ...semFinanciamento,
      aluguelMensal: dec(0),
      valorizacaoAnual: 0.1,
      custoVendaFinal: 0.05,
    });
    expect(r.meses[11]!.valorImovel.toFixed(2)).toBe("110000.00");
    expect(r.final.comprar.toFixed(2)).toBe("104500.00");
  });

  it("empate quando os patrimônios são iguais", () => {
    const r = alugarOuComprar({ ...semFinanciamento, aluguelMensal: dec(0) });
    expect(r.final.maiorPatrimonio).toBe("igual");
    expect(r.mesEmQueComprarAlcanca).toBe(1);
  });

  it("lista as premissas da simulação", () => {
    expect(alugarOuComprar(semFinanciamento).premissas.join(" ")).toMatch(/oportunidade/);
  });

  it("recusa entrada maior que o imóvel e falta de financiamento", () => {
    expect(() => alugarOuComprar({ ...semFinanciamento, entrada: dec(200000) })).toThrow(
      ErroParametroFinanceiro,
    );
    expect(() => alugarOuComprar({ ...semFinanciamento, entrada: dec(50000) })).toThrow(/financiamento/);
    expect(() => alugarOuComprar({ ...semFinanciamento, horizonteMeses: 0 })).toThrow(/horizonte/);
  });
});
