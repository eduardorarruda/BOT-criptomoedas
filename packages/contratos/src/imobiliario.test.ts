import { describe, expect, it } from "vitest";
import {
  ConsultaImobiliarioEsquema,
  MudancaInvestimentoImobiliarioEsquema,
  NovoInvestimentoImobiliarioEsquema,
  NovoLancamentoImobiliarioEsquema,
  PedidoAlugarComprarEsquema,
  PedidoGanhoCapitalEsquema,
  PedidoSimulacaoFinanciamentoEsquema,
  PedidoSimulacaoFiiEsquema,
  problemasDoTipo,
} from "./esquemas.js";

const caminhos = (r: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }) =>
  r.error?.issues.map((i) => i.path.join(".")) ?? [];

describe("cadastro de investimento imobiliário", () => {
  it("aceita um imóvel para renda com financiamento e lançamentos iniciais", () => {
    const r = NovoInvestimentoImobiliarioEsquema.safeParse({
      tipo: "aluguel",
      nome: "  Apto Centro  ",
      valorizacaoAnual: 0.04,
      financiamento: {
        sistema: "SAC",
        valorFinanciado: "300000",
        taxaAnual: 0.105,
        prazoMeses: 360,
        primeiraParcela: "2026-02-10",
      },
      lancamentosIniciais: [{ data: "2026-01-10", tipo: "aporte", categoria: "Entrada", valor: "100000" }],
    });
    expect(r.success).toBe(true);
    expect(r.data?.nome).toBe("Apto Centro");
    expect(r.data?.lancamentosIniciais?.[0]?.categoria).toBe("entrada");
  });

  it("FII exige ticker e normaliza para maiúsculas", () => {
    expect(caminhos(NovoInvestimentoImobiliarioEsquema.safeParse({ tipo: "fii", nome: "x" }))).toContain(
      "ticker",
    );
    const r = NovoInvestimentoImobiliarioEsquema.safeParse({ tipo: "fii", nome: "x", ticker: "hglg11" });
    expect(r.data?.ticker).toBe("HGLG11");
  });

  it("REIT só em dólar; os demais só em real", () => {
    expect(
      caminhos(NovoInvestimentoImobiliarioEsquema.safeParse({ tipo: "reit", nome: "O", ticker: "O" })),
    ).toContain("moeda");
    expect(
      NovoInvestimentoImobiliarioEsquema.safeParse({ tipo: "reit", nome: "O", ticker: "O", moeda: "USD" })
        .success,
    ).toBe(true);
    expect(
      caminhos(NovoInvestimentoImobiliarioEsquema.safeParse({ tipo: "aluguel", nome: "x", moeda: "USD" })),
    ).toContain("moeda");
  });

  it("financiamento só em imóvel físico; consórcio e temporada pedem seus campos", () => {
    const fin = {
      sistema: "PRICE",
      valorFinanciado: "1",
      taxaAnual: 0.1,
      prazoMeses: 12,
      primeiraParcela: "2026-01-01",
    };
    expect(
      caminhos(
        NovoInvestimentoImobiliarioEsquema.safeParse({
          tipo: "fii",
          nome: "x",
          ticker: "AB11",
          financiamento: fin,
        }),
      ),
    ).toContain("financiamento");
    expect(
      caminhos(NovoInvestimentoImobiliarioEsquema.safeParse({ tipo: "consorcio", nome: "x" })),
    ).toContain("valorCarta");
    expect(
      caminhos(NovoInvestimentoImobiliarioEsquema.safeParse({ tipo: "temporada", nome: "x" })),
    ).toContain("diaria");
    expect(
      problemasDoTipo({ tipo: "consorcio", valorCarta: "200000", prazoMeses: 180, taxaAdministracao: 0.17 }),
    ).toEqual([]);
  });

  it("recusa dinheiro negativo, fração acima de 100% e data malformada", () => {
    const r = NovoInvestimentoImobiliarioEsquema.safeParse({
      tipo: "aluguel",
      nome: "x",
      valorAtual: "-1",
      ocupacao: 1.5,
      dataEntrega: "2026-13-01",
    });
    expect(caminhos(r)).toEqual(expect.arrayContaining(["valorAtual", "ocupacao", "dataEntrega"]));
  });

  it("mudança parcial aceita null para limpar", () => {
    expect(MudancaInvestimentoImobiliarioEsquema.safeParse({ valorAtual: null, nome: "novo" }).success).toBe(
      true,
    );
    expect(MudancaInvestimentoImobiliarioEsquema.safeParse({ nome: "" }).success).toBe(false);
  });
});

describe("lançamentos", () => {
  it("valor precisa ser positivo", () => {
    const base = { data: "2026-01-01", tipo: "receita", categoria: "aluguel" };
    expect(NovoLancamentoImobiliarioEsquema.safeParse({ ...base, valor: "0" }).success).toBe(false);
    expect(NovoLancamentoImobiliarioEsquema.safeParse({ ...base, valor: "0.00" }).success).toBe(false);
    expect(NovoLancamentoImobiliarioEsquema.safeParse({ ...base, valor: "0.01" }).success).toBe(true);
    expect(NovoLancamentoImobiliarioEsquema.safeParse({ ...base, tipo: "doacao", valor: "1" }).success).toBe(
      false,
    );
  });
});

describe("consulta e simuladores", () => {
  it("consulta converte o CDI de texto e limita a 100%", () => {
    expect(ConsultaImobiliarioEsquema.parse({ cdiAnual: "0.1" }).cdiAnual).toBe(0.1);
    expect(ConsultaImobiliarioEsquema.safeParse({ cdiAnual: "2" }).success).toBe(false);
  });

  it("pedidos dos simuladores validam o essencial", () => {
    expect(
      PedidoSimulacaoFinanciamentoEsquema.safeParse({
        valorFinanciado: "1000",
        taxaAnual: 0.1,
        prazoMeses: 12,
      }).success,
    ).toBe(true);
    expect(
      PedidoSimulacaoFiiEsquema.safeParse({
        cotas: 1.5,
        precoCota: "10",
        rendimentoMensalPorCota: "0.1",
        meses: 1,
      }).success,
    ).toBe(false);
    expect(
      PedidoGanhoCapitalEsquema.safeParse({
        valorVenda: "1",
        custoAquisicao: "1",
        dataAquisicao: "2020-01-01",
        dataVenda: "2026-01-01",
      }).success,
    ).toBe(true);
    expect(
      PedidoAlugarComprarEsquema.safeParse({
        valorImovel: "500000",
        entrada: "100000",
        custosCompra: "20000",
        aluguelMensal: "2500",
        reajusteAnual: 0.04,
        custosProprietarioMensais: "300",
        valorizacaoAnual: 0.04,
        taxaOportunidadeAnual: 0.1,
        horizonteMeses: 0,
      }).success,
    ).toBe(false);
  });
});
