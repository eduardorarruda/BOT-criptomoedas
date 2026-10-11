import { describe, expect, it } from "vitest";
import { ehErroApi } from "../../api/erros";
import { criarFonteImobiliarioDemo } from "./demo";

const HOJE = "2026-10-11";

describe("carteira imobiliária de demonstração", () => {
  it("vem com exemplos de vários tipos, todos com métricas calculadas", async () => {
    const f = criarFonteImobiliarioDemo(HOJE);
    const v = await f.visao({ cdiAnual: 0.1 });
    expect(v.quantidade).toBeGreaterThanOrEqual(4);
    expect(v.itens.every((i) => i.metricas !== null)).toBe(true);
    expect(new Set(v.itens.map((i) => i.investimento.tipo)).size).toBeGreaterThanOrEqual(4);
    expect(v.alocacao.length).toBeGreaterThan(1);
    expect(v.itens[0]!.metricas!.cdi).not.toBeNull();
  });

  it("cria, lança, detalha com tabela e remove", async () => {
    const f = criarFonteImobiliarioDemo(HOJE);
    const d = await f.criar({
      tipo: "aluguel",
      nome: "Teste",
      financiamento: {
        sistema: "PRICE",
        valorFinanciado: "100000",
        taxaAnual: 0.1,
        prazoMeses: 120,
        primeiraParcela: "2026-01-10",
      },
      lancamentosIniciais: [{ data: "2025-12-10", tipo: "aporte", categoria: "entrada", valor: "50000" }],
    });
    expect(d.tabela!.linhas).toHaveLength(120);
    const l = await f.adicionarLancamento(d.investimento.id, {
      data: "2026-02-10",
      tipo: "receita",
      categoria: "aluguel",
      valor: "1500",
    });
    expect((await f.detalhe(d.investimento.id, {})).lancamentos).toHaveLength(2);
    await f.removerLancamento(d.investimento.id, l.id);
    const atualizado = await f.atualizar(d.investimento.id, { valorAtual: "180000" });
    expect(atualizado.metricas!.fonteValorAtual).toBe("manual");
    await f.remover(d.investimento.id);
    await expect(f.detalhe(d.investimento.id, {})).rejects.toSatisfy(ehErroApi);
  });

  it("recusa o que não fecha, como a API", async () => {
    const f = criarFonteImobiliarioDemo(HOJE);
    await expect(f.criar({ tipo: "fii", nome: "sem ticker" })).rejects.toSatisfy(ehErroApi);
    const d = await f.criar({
      tipo: "fii",
      nome: "Cotas",
      ticker: "ABCD11",
      lancamentosIniciais: [
        { data: "2026-01-02", tipo: "aporte", categoria: "compra", valor: "100", quantidade: "1" },
      ],
    });
    await expect(
      f.adicionarLancamento(d.investimento.id, {
        data: "2026-02-02",
        tipo: "resgate",
        categoria: "venda",
        valor: "500",
        quantidade: "5",
      }),
    ).rejects.toThrow(/cotas/);
    expect((await f.detalhe(d.investimento.id, {})).lancamentos).toHaveLength(1);
  });
});
