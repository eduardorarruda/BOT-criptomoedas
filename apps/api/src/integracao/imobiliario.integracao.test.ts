import { dec } from "@zentrade/dominio";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ClienteCotacoesB3 } from "../integracoes/cotacoes-b3.js";
import { comSessao, montarApi, type Api, type Pessoa } from "./ajuda.js";

/** Cotações falsas: nada de serviço externo nos testes. */
const cotacoesFalsas: ClienteCotacoesB3 = {
  configurado: true,
  cotar: async (tickers) => ({
    cotacoes: tickers
      .filter((t) => t === "HGLG11")
      .map((ticker) => ({ ticker, preco: dec("160.5"), moeda: "BRL", em: 1_790_000_000_000 })),
    indisponiveis: tickers.filter((t) => t !== "HGLG11").map((ticker) => ({ ticker, motivo: "sem cotação" })),
  }),
};

const APARTAMENTO = {
  tipo: "aluguel",
  nome: "Apto Centro",
  valorAtual: "520000",
  financiamento: {
    sistema: "SAC",
    valorFinanciado: "320000",
    taxaAnual: 0.1,
    prazoMeses: 360,
    primeiraParcela: "2025-02-10",
  },
  lancamentosIniciais: [
    { data: "2025-01-10", tipo: "aporte", categoria: "entrada", valor: "180000" },
    { data: "2025-01-12", tipo: "aporte", categoria: "itbi", valor: "15000" },
  ],
};

describe("rotas do imobiliário contra banco e Redis reais", () => {
  let api: Api;
  let ana: Pessoa;
  let beto: Pessoa;
  let apartamentoId: string;
  let fiiId: string;

  const chamar = (p: Pessoa, method: "GET" | "POST" | "PATCH" | "DELETE", url: string, payload?: object) =>
    api.app.inject({ method, url: `/api/v1${url}`, headers: comSessao(p), ...(payload ? { payload } : {}) });

  beforeAll(async () => {
    api = await montarApi({ cotacoesB3: cotacoesFalsas });
    ana = await api.pessoa("ana.imoveis@exemplo.com");
    beto = await api.pessoa("beto.imoveis@exemplo.com");
  });
  afterAll(async () => api.encerrar());

  it("visão vazia explica o estado (zero, sem alocação)", async () => {
    const r = await chamar(ana, "GET", "/imobiliario?dataBase=2025-06-10");
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ patrimonio: "0", quantidade: 0, alocacao: [], itens: [] });
  });

  it("cadastra imóvel financiado e devolve métricas e a tabela com vencimentos", async () => {
    const r = await chamar(ana, "POST", "/imobiliario/investimentos", APARTAMENTO);
    expect(r.statusCode).toBe(201);
    const d = r.json();
    apartamentoId = d.investimento.id;
    expect(d.tabela.linhas).toHaveLength(360);
    expect(d.tabela.linhas[0]).toMatchObject({ mes: 1, vencimento: "2025-02-10" });
    expect(d.lancamentos).toHaveLength(2);
    expect(d.metricas.premissas.length).toBeGreaterThan(0);

    const detalhe = await chamar(
      ana,
      "GET",
      `/imobiliario/investimentos/${apartamentoId}?dataBase=2025-06-10&cdiAnual=0.1`,
    );
    const m = detalhe.json().metricas;
    expect(m.financiamento.parcelasPagas).toBe(5);
    expect(m.investido).toBe("195000");
    expect(dec(m.dividaAtual).lt(320000)).toBe(true);
    expect(m.cdi.taxaAnual).toBe(0.1);
    expect(m.fonteValorAtual).toBe("manual");
  });

  it("FII com cotação automática, lançamentos e preço médio", async () => {
    const r = await chamar(ana, "POST", "/imobiliario/investimentos", {
      tipo: "fii",
      nome: "Logística",
      ticker: "hglg11",
      lancamentosIniciais: [
        { data: "2025-03-03", tipo: "aporte", categoria: "compra", valor: "1550", quantidade: "10" },
      ],
    });
    expect(r.statusCode).toBe(201);
    fiiId = r.json().investimento.id;
    expect(r.json().investimento.ticker).toBe("HGLG11");

    const provento = await chamar(ana, "POST", `/imobiliario/investimentos/${fiiId}/lancamentos`, {
      data: "2025-04-15",
      tipo: "receita",
      categoria: "provento",
      valor: "11",
    });
    expect(provento.statusCode).toBe(201);

    const d = (await chamar(ana, "GET", `/imobiliario/investimentos/${fiiId}?dataBase=2025-06-10`)).json();
    expect(d.cotacao).toMatchObject({ ticker: "HGLG11", preco: "160.5", fonte: "brapi" });
    expect(d.metricas).toMatchObject({
      fonteValorAtual: "cotacao",
      valorAtual: "1605",
      rendaAcumulada: "11",
    });
    expect(d.metricas.cotas).toMatchObject({ quantidade: "10", precoMedio: "155" });
  });

  it("recusa vender mais cotas do que há, sem gravar nada", async () => {
    const r = await chamar(ana, "POST", `/imobiliario/investimentos/${fiiId}/lancamentos`, {
      data: "2025-05-01",
      tipo: "resgate",
      categoria: "venda",
      valor: "3000",
      quantidade: "20",
    });
    expect(r.statusCode).toBe(400);
    expect(r.json().erro.mensagem).toMatch(/cotas/);
    const d = (await chamar(ana, "GET", `/imobiliario/investimentos/${fiiId}`)).json();
    expect(d.lancamentos).toHaveLength(2);
  });

  it("valida o cadastro por tipo", async () => {
    const semTicker = await chamar(ana, "POST", "/imobiliario/investimentos", { tipo: "fii", nome: "x" });
    expect(semTicker.statusCode).toBe(400);
    expect(semTicker.json().erro.codigo).toBe("dados_invalidos");
    const reitSemCambio = await chamar(ana, "POST", "/imobiliario/investimentos", {
      tipo: "reit",
      nome: "Realty",
      ticker: "O",
      moeda: "USD",
      lancamentosIniciais: [
        { data: "2025-01-02", tipo: "aporte", categoria: "compra", valor: "100", quantidade: "2" },
      ],
    });
    expect(reitSemCambio.statusCode).toBe(400);
    expect(reitSemCambio.json().erro.mensagem).toMatch(/câmbio/);
  });

  it("atualiza, lista com visão consolidada e alocação por tipo", async () => {
    const p = await chamar(ana, "PATCH", `/imobiliario/investimentos/${apartamentoId}`, {
      valorAtual: "540000",
    });
    expect(p.statusCode).toBe(200);
    expect(p.json().investimento.valorAtual).toBe("540000");

    const v = (await chamar(ana, "GET", "/imobiliario?dataBase=2025-06-10&cdiAnual=0.1")).json();
    expect(v.quantidade).toBe(2);
    expect(v.itens).toHaveLength(2);
    expect(v.alocacao.map((a: { tipo: string }) => a.tipo)).toEqual(["aluguel", "fii"]);
    expect(v.cdiAnual).toBe(0.1);
    const lista = (await chamar(ana, "GET", "/imobiliario/investimentos")).json();
    expect(lista).toHaveLength(2);
  });

  it("cotações sob demanda", async () => {
    const r = (await chamar(ana, "GET", "/imobiliario/cotacoes?tickers=HGLG11,XPML11")).json();
    expect(r.configurado).toBe(true);
    expect(r.cotacoes.map((c: { ticker: string }) => c.ticker)).toEqual(["HGLG11"]);
    expect(r.indisponiveis[0].ticker).toBe("XPML11");
  });

  it("isolamento: outra pessoa não vê, não altera e não lança", async () => {
    expect((await chamar(beto, "GET", `/imobiliario/investimentos/${apartamentoId}`)).statusCode).toBe(404);
    expect(
      (await chamar(beto, "PATCH", `/imobiliario/investimentos/${apartamentoId}`, { nome: "meu" }))
        .statusCode,
    ).toBe(404);
    expect(
      (
        await chamar(beto, "POST", `/imobiliario/investimentos/${apartamentoId}/lancamentos`, {
          data: "2025-04-15",
          tipo: "receita",
          categoria: "aluguel",
          valor: "1",
        })
      ).statusCode,
    ).toBe(404);
    expect((await chamar(beto, "DELETE", `/imobiliario/investimentos/${apartamentoId}`)).statusCode).toBe(
      404,
    );
    expect((await chamar(beto, "GET", "/imobiliario/investimentos")).json()).toEqual([]);
    expect((await chamar(ana, "GET", "/imobiliario/investimentos/nao-e-uuid")).statusCode).toBe(404);
  });

  it("sem sessão: 401; escrita sem CSRF: 403", async () => {
    expect((await api.app.inject({ method: "GET", url: "/api/v1/imobiliario" })).statusCode).toBe(401);
    const semCsrf = await api.app.inject({
      method: "POST",
      url: "/api/v1/imobiliario/investimentos",
      headers: { cookie: ana.cookie },
      payload: APARTAMENTO,
    });
    expect(semCsrf.statusCode).toBe(403);
  });

  it("simuladores respondem sem cadastro", async () => {
    const fin = await chamar(ana, "POST", "/imobiliario/simulacoes/financiamento", {
      valorFinanciado: "100000",
      taxaAnual: 0.12682503013197,
      prazoMeses: 12,
    });
    expect(fin.statusCode).toBe(200);
    expect(fin.json().price.primeiraParcela).toBe("8884.88");
    expect(fin.json().sac.totalJuros).toBe("6500");

    const ac = await chamar(ana, "POST", "/imobiliario/simulacoes/alugar-comprar", {
      valorImovel: "500000",
      entrada: "100000",
      custosCompra: "20000",
      financiamento: { sistema: "SAC", taxaAnual: 0.11, prazoMeses: 360 },
      aluguelMensal: "2500",
      reajusteAnual: 0.04,
      custosProprietarioMensais: "300",
      valorizacaoAnual: 0.04,
      taxaOportunidadeAnual: 0.1,
      horizonteMeses: 120,
    });
    expect(ac.statusCode).toBe(200);
    expect(ac.json().meses).toHaveLength(120);
    expect(["comprar", "alugar", "igual"]).toContain(ac.json().final.maiorPatrimonio);

    const rent = await chamar(ana, "POST", "/imobiliario/simulacoes/rentabilidade", {
      valorCompra: "400000",
      custosAquisicao: "0",
      rendaMensal: "2000",
      reajusteAnual: 0,
      valorizacaoAnual: 0,
      horizonteAnos: 10,
      taxaDescontoAnual: 0.06,
    });
    expect(rent.json().tirAnual).toBeCloseTo(0.06, 8);

    const fii = await chamar(ana, "POST", "/imobiliario/simulacoes/fii", {
      cotas: 200,
      precoCota: "100",
      rendimentoMensalPorCota: "0.85",
      meses: 12,
    });
    expect(fii.json().rendaMensal).toBe("170");

    const gc = await chamar(ana, "POST", "/imobiliario/simulacoes/ganho-capital", {
      valorVenda: "800000",
      custoAquisicao: "600000",
      dataAquisicao: "2018-01-10",
      dataVenda: "2026-01-10",
      aplicarFatoresReducao: false,
    });
    expect(gc.json()).toMatchObject({ ganhoBruto: "200000", imposto: "30000", isento: false });
  });

  it("simulação com parâmetro que não fecha vira 400 com explicação", async () => {
    const r = await chamar(ana, "POST", "/imobiliario/simulacoes/alugar-comprar", {
      valorImovel: "500000",
      entrada: "100000",
      custosCompra: "0",
      aluguelMensal: "2500",
      reajusteAnual: 0,
      custosProprietarioMensais: "0",
      valorizacaoAnual: 0,
      taxaOportunidadeAnual: 0.1,
      horizonteMeses: 12,
    });
    expect(r.statusCode).toBe(400);
    expect(r.json().erro.mensagem).toMatch(/financiamento/);
  });

  it("remove lançamento e investimento", async () => {
    const d = (await chamar(ana, "GET", `/imobiliario/investimentos/${fiiId}`)).json();
    const provento = d.lancamentos.find((l: { tipo: string }) => l.tipo === "receita");
    expect(
      (await chamar(ana, "DELETE", `/imobiliario/investimentos/${fiiId}/lancamentos/${provento.id}`))
        .statusCode,
    ).toBe(204);
    expect((await chamar(ana, "DELETE", `/imobiliario/investimentos/${fiiId}`)).statusCode).toBe(204);
    expect((await chamar(ana, "GET", `/imobiliario/investimentos/${fiiId}`)).statusCode).toBe(404);
  });
});
