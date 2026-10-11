import { dec } from "@zentrade/dominio";
import { describe, expect, it } from "vitest";
import { negociacao } from "../teste/negociacao.js";
import { calcularCarteira } from "./calculo.js";
import type { Negociacao, SaldoConta } from "./tipos.js";

const saldo = (livre: string, bloqueado = "0"): SaldoConta => ({
  livre: dec(livre),
  bloqueado: dec(bloqueado),
});
const precos = (p: Record<string, string>) => new Map(Object.entries(p).map(([k, v]) => [k, dec(v)]));

function calcular(negociacoes: Negociacao[], saldos: Record<string, SaldoConta>, p: Record<string, string>) {
  return calcularCarteira({ negociacoes, saldos: new Map(Object.entries(saldos)), precos: precos(p) });
}

const moeda = (r: ReturnType<typeof calcular>, ativo: string) => {
  const m = r.moedas.find((x) => x.ativo === ativo);
  if (!m) throw new Error(`sem ${ativo}`);
  return m;
};

describe("carteira: taxa paga em BNB", () => {
  const r = calcular(
    [
      negociacao({
        base: "BNB",
        preco: "500",
        quantidade: "1",
        taxa: "0.001",
        ativoTaxa: "BNB",
        taxaUsdt: "0.5",
        em: 1,
      }),
      negociacao({
        preco: "50000",
        quantidade: "0.01",
        taxa: "0.0001",
        ativoTaxa: "BNB",
        taxaUsdt: "0.06",
        em: 2,
      }),
    ],
    { BTC: saldo("0.01"), BNB: saldo("0.9989") },
    { BTC: "60000", BNB: "650" },
  );

  it("a taxa em BNB entra em USDT na moeda negociada", () => {
    const btc = moeda(r, "BTC").total;
    expect(btc).toMatchObject({
      quantidade: "0.01",
      precoMedio: "50000",
      custoPosicao: "500",
      valorAtual: "600",
      resultadoNaoRealizado: "100",
      taxas: "0.06",
      resultadoRealizadoLiquido: "-0.06",
      resultadoLiquido: "99.94",
      retorno: "0.19988",
    });
  });

  it("o BNB gasto em taxa sai do BNB pelo custo médio e o saldo bate", () => {
    const bnb = moeda(r, "BNB");
    expect(bnb.total).toMatchObject({
      quantidade: "0.9989",
      custoPosicao: "499.45",
      precoMedio: "500",
      taxas: "0.5",
    });
    expect(bnb.quantidadeSemCusto).toBe("0");
    expect(bnb.quantidadeForaDoSaldo).toBe("0");
    expect(bnb.avisos).toEqual([]);
  });

  it("o resumo soma as moedas", () => {
    expect(r.resumo.total).toMatchObject({
      custoPosicao: "999.45",
      taxas: "0.56",
      resultadoRealizadoBruto: "0",
    });
    expect(r.resumo.valorConta).toBe("1249.285");
  });
});

describe("carteira: venda parcial, venda total e recompra", () => {
  const ns = [
    negociacao({ base: "ETH", preco: "2000", quantidade: "2", taxa: "4", em: 1 }),
    negociacao({ base: "ETH", lado: "VENDA", preco: "2500", quantidade: "0.5", taxa: "1.25", em: 2 }),
    negociacao({ base: "ETH", lado: "VENDA", preco: "1800", quantidade: "1.5", taxa: "2.7", em: 3 }),
    negociacao({ base: "ETH", preco: "1000", quantidade: "1", taxa: "1", em: 4 }),
  ];

  it("realiza cada venda contra o médio e recomeça o médio depois de zerar", () => {
    const eth = moeda(calcular(ns, { ETH: saldo("1") }, { ETH: "1100" }), "ETH").total;
    expect(eth).toMatchObject({
      quantidadeComprada: "3",
      custoComprado: "5000",
      quantidadeVendida: "2",
      valorVendido: "3950",
      quantidade: "1",
      precoMedio: "1000",
      custoPosicao: "1000",
      // (2500 − 2000) × 0,5 + (1800 − 2000) × 1,5 = 250 − 300
      resultadoRealizadoBruto: "-50",
      taxas: "8.95",
      resultadoRealizadoLiquido: "-58.95",
      resultadoNaoRealizado: "100",
      resultadoLiquido: "41.05",
      retorno: "0.00821",
      negociacoes: 4,
    });
  });

  it("depois da venda total, sem preço atual o resultado ainda é conhecido (posição zero)", () => {
    const eth = moeda(calcular(ns.slice(0, 3), { ETH: saldo("0") }, {}), "ETH");
    expect(eth.total).toMatchObject({ quantidade: "0", valorAtual: "0", resultadoNaoRealizado: "0" });
    expect(eth.total.resultadoLiquido).toBe("-57.95");
    expect(eth.preco).toBeNull();
  });
});

describe("carteira: depósito sem negociação", () => {
  const r = calcular(
    [negociacao({ base: "SOL", preco: "100", quantidade: "0.5", em: 1 })],
    { SOL: saldo("1.5", "0.5"), USDT: saldo("100") },
    { SOL: "120" },
  );

  it("o saldo que nenhuma negociação explica fica com custo desconhecido, nunca zero", () => {
    const sol = moeda(r, "SOL");
    expect(sol.saldo).toEqual({ livre: "1.5", bloqueado: "0.5", total: "2" });
    expect(sol.quantidadeSemCusto).toBe("1.5");
    expect(sol.valorSemCusto).toBe("180");
    expect(sol.valorSaldo).toBe("240");
    expect(sol.total).toMatchObject({ quantidade: "0.5", custoPosicao: "50", resultadoNaoRealizado: "10" });
    expect(sol.avisos.join(" ")).toMatch(/custo desconhecido/);
  });

  it("entra no valor da conta, mas não no investido nem no resultado", () => {
    expect(r.resumo.valorSemCusto).toBe("180");
    expect(r.resumo.valorConta).toBe("340");
    expect(r.resumo.caixa).toBe("100");
    expect(r.resumo.total).toMatchObject({ custoPosicao: "50", valorAtual: "60", resultadoLiquido: "10" });
  });

  it("alocação pelo valor de cada moeda na conta", () => {
    expect(moeda(r, "SOL").alocacao).toBe("0.7058823529");
    expect(moeda(r, "USDT").alocacao).toBe("0.2941176471");
  });

  it("USDT é a referência: caixa, preço 1, sem resultado", () => {
    const usdt = moeda(r, "USDT");
    expect(usdt).toMatchObject({ referencia: true, preco: "1", valorSaldo: "100", quantidadeSemCusto: "0" });
    expect(usdt.total.custoPosicao).toBe("0");
  });

  it("moedas em ordem do maior valor na conta", () => {
    expect(r.moedas.map((m) => m.ativo)).toEqual(["SOL", "USDT"]);
  });
});

describe("carteira: robô × manual × total", () => {
  const r = calcular(
    [
      negociacao({ preco: "100", quantidade: "1", origem: "robo", em: 1 }),
      negociacao({ preco: "200", quantidade: "1", origem: "manual", em: 2 }),
      negociacao({ lado: "VENDA", preco: "300", quantidade: "1", origem: "manual", em: 3 }),
    ],
    { BTC: saldo("1") },
    { BTC: "300" },
  );

  it("cada parcela tem o próprio preço médio; o total usa todas as compras", () => {
    const btc = moeda(r, "BTC");
    expect(btc.robo).toMatchObject({ quantidade: "1", precoMedio: "100", resultadoNaoRealizado: "200" });
    expect(btc.manual).toMatchObject({ quantidade: "0", resultadoRealizadoBruto: "100" });
    expect(btc.total).toMatchObject({ quantidade: "1", precoMedio: "150", resultadoRealizadoBruto: "150" });
    expect(r.resumo.robo.resultadoLiquido).toBe("200");
    expect(r.resumo.manual.resultadoLiquido).toBe("100");
    expect(r.resumo.total.resultadoLiquido).toBe("300");
  });

  it("venda manual de moeda que o robô comprou: o excedente fica sem custo na parcela manual", () => {
    const s = calcular(
      [
        negociacao({ preco: "100", quantidade: "1", origem: "robo", em: 1 }),
        negociacao({ lado: "VENDA", preco: "120", quantidade: "1", origem: "manual", em: 2 }),
      ],
      { BTC: saldo("0") },
      { BTC: "120" },
    );
    const btc = moeda(s, "BTC");
    expect(btc.manual).toMatchObject({ quantidadeVendidaSemCusto: "1", resultadoRealizadoBruto: "0" });
    expect(btc.total).toMatchObject({ quantidadeVendidaSemCusto: "0", resultadoRealizadoBruto: "20" });
    expect(btc.avisos.join(" ")).toMatch(/robô e manual/);
  });
});

describe("carteira: o que não se sabe aparece como não sabido", () => {
  it("moeda sem preço em USDT: fora do valor da conta e com aviso", () => {
    const r = calcular([], { XYZ: saldo("10"), USDT: saldo("5") }, {});
    const xyz = moeda(r, "XYZ");
    expect([xyz.preco, xyz.valorSaldo, xyz.alocacao, xyz.valorSemCusto]).toEqual([null, null, null, null]);
    expect(xyz.quantidadeSemCusto).toBe("10");
    expect(r.avisos.join(" ")).toMatch(/XYZ/);
    expect(r.resumo.valorConta).toBe("5");
  });

  it("negociação sem conversão para USDT fica fora e é avisada", () => {
    const r = calcular(
      [negociacao({ cotacao: "FDUSD", preco: "50000", quantidade: "1", cotacaoUsdt: null, taxaUsdt: null })],
      { BTC: saldo("1") },
      { BTC: "50000" },
    );
    const btc = moeda(r, "BTC");
    expect(btc.total.semConversao).toBe(1);
    expect(btc.avisos.join(" ")).toMatch(/sem conversão/);
  });

  it("taxa sem conversão: avisa que as taxas estão incompletas", () => {
    const r = calcular(
      [negociacao({ preco: "10", quantidade: "1", taxa: "0.1", ativoTaxa: "BNB", taxaUsdt: null })],
      { BTC: saldo("1") },
      { BTC: "10" },
    );
    expect(moeda(r, "BTC").avisos.join(" ")).toMatch(/taxa/);
  });

  it("saldo menor que as negociações (saque, Earn): mostra a diferença", () => {
    const r = calcular([negociacao({ preco: "10", quantidade: "2" })], { BTC: saldo("0.5") }, { BTC: "10" });
    const btc = moeda(r, "BTC");
    expect(btc.quantidadeForaDoSaldo).toBe("1.5");
    expect(btc.avisos.join(" ")).toMatch(/saque/);
  });

  it("moeda negociada que não está mais no saldo aparece com saldo zero", () => {
    const r = calcular([negociacao({ preco: "10", quantidade: "1" })], {}, { BTC: "12" });
    expect(moeda(r, "BTC").saldo.total).toBe("0");
  });

  it("carteira vazia: tudo zero, retorno desconhecido", () => {
    const r = calcular([], {}, {});
    expect(r.moedas).toEqual([]);
    expect(r.resumo.total).toMatchObject({ custoPosicao: "0", resultadoLiquido: "0", retorno: null });
    expect(r.resumo.valorConta).toBe("0");
  });

  it("negociações fora de ordem são aplicadas na ordem do tempo", () => {
    const r = calcular(
      [
        negociacao({ lado: "VENDA", preco: "20", quantidade: "1", em: 5 }),
        negociacao({ preco: "10", quantidade: "1", em: 1 }),
      ],
      {},
      { BTC: "20" },
    );
    expect(moeda(r, "BTC").total.resultadoRealizadoBruto).toBe("10");
  });
});

describe("carteira: moeda zerada sem preço", () => {
  it("não entra na lista de moedas sem preço: saldo zero vale zero", () => {
    const r = calcular([], { XYZ: saldo("0") }, {});
    expect(moeda(r, "XYZ").valorSaldo).toBe("0");
    expect(r.avisos).toEqual([]);
  });
});
