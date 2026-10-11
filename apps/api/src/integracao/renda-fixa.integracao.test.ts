import { listarDiasUteis } from "@zentrade/financas";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarAtualizadorIndicadores } from "../integracoes/bcb-atualizador.js";
import type { ClienteBcb } from "../integracoes/bcb.js";
import { criarSincronizadorPluggy } from "../integracoes/pluggy-sincronizador.js";
import type { ClientePluggy, InvestimentoPluggyApi } from "../integracoes/pluggy.js";
import { hojeEm } from "../rotas/renda-fixa-servico.js";
import { comSessao, montarApi, type Api, type Pessoa } from "./ajuda.js";

const AGORA = Date.parse("2026-10-10T15:00:00Z");
const ITEM = "4b6a1a5e-8e0a-4c55-9f43-3b8f3c1d2e7a";
const silencioso = { warn: () => undefined, info: () => undefined };

/** Banco Central falso: CDI e Selic constantes, IPCA de 0,4% ao mês, poupança 0,6698%. */
const bcbFalso: ClienteBcb = {
  async serie(codigo, de, ate) {
    const diarios = (valor: string) =>
      listarDiasUteis(de < "2025-01-01" ? "2025-01-01" : de, ate).map((dia) => ({
        dia,
        valor,
        diaFim: null,
      }));
    if (codigo === 12 || codigo === 11) return diarios("0.050788");
    if (codigo === 432) return diarios("13.75");
    if (codigo === 433) {
      const meses = Array.from(
        { length: 21 },
        (_, i) => `${2025 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}-01`,
      );
      return meses
        .filter((d) => d >= de.slice(0, 8) + "01" && d <= ate)
        .map((dia) => ({ dia, valor: "0.4", diaFim: null }));
    }
    if (codigo === 195) return [{ dia: "2026-09-10", valor: "0.6698", diaFim: "2026-10-10" }];
    return [];
  },
};

const caixinha: InvestimentoPluggyApi = {
  id: "inv-caixinha-1",
  name: null,
  type: "FIXED_INCOME",
  subtype: "CDB",
  status: "ACTIVE",
  balance: 1010,
  amount: 1012,
  amountOriginal: 1000,
  taxes: 2,
  taxes2: 0,
  rate: 100,
  rateType: "CDI",
  issuer: "Nu Financeira",
  issuerCNPJ: "30.680.829/0001-43",
  purchaseDate: "2026-06-01T00:00:00Z",
  date: "2026-10-10T00:00:00Z",
};

function pluggyFalsa(clientUserId: () => string): ClientePluggy {
  return {
    connectToken: async () => "token-do-widget",
    item: async () => ({
      id: ITEM,
      status: "UPDATED",
      clientUserId: clientUserId(),
      lastUpdatedAt: "2026-10-10T12:00:00Z",
      consentExpiresAt: null,
      error: null,
      connector: { id: 612, name: "MeuPluggy", imageUrl: null },
    }),
    investimentos: async () => [caixinha, { ...caixinha, id: "fundo", type: "MUTUAL_FUND" }],
    pedirAtualizacao: async () => false,
  };
}

const CDB = {
  tipo: "CDB",
  nome: "CDB Banco X 110%",
  emissor: "Banco X",
  indexador: "CDI",
  percentualIndexador: "110",
  dataAplicacao: "2026-01-15",
  vencimento: "2028-01-15",
  valorAplicado: "10000.00",
  liquidez: "vencimento",
};

describe("API de renda fixa e Pluggy", () => {
  let api: Api;
  let ana: Pessoa;
  let beto: Pessoa;
  let donoDoItem = "";

  beforeAll(async () => {
    api = await montarApi({
      rendaFixa: (banco, agora) => ({
        indicadores: criarAtualizadorIndicadores({
          cliente: bcbFalso,
          armazem: banco.indicadores,
          agora,
          log: silencioso,
        }),
        pluggy: criarSincronizadorPluggy({
          cliente: pluggyFalsa(() => donoDoItem),
          armazem: banco.pluggy,
          agora,
          hoje: () => hojeEm(agora()),
          log: silencioso,
        }),
      }),
    });
    api.relogio.t = AGORA;
    ana = await api.pessoa("ana@exemplo.com");
    beto = await api.pessoa("beto@exemplo.com");
    donoDoItem = ana.id;
  });
  afterAll(async () => api.encerrar());

  const pedir = (p: Pessoa, method: "GET" | "POST" | "PATCH" | "DELETE", url: string, payload?: unknown) =>
    api.app.inject({ method, url: `/api/v1${url}`, headers: comSessao(p), ...(payload ? { payload } : {}) });

  it("sem índices: o título é cadastrado e a posição diz o que falta", async () => {
    const r = await pedir(ana, "POST", "/renda-fixa/titulos", CDB);
    expect(r.statusCode).toBe(201);
    expect(r.json().posicao).toMatchObject({
      disponivel: false,
      motivo: expect.stringMatching(/faltam dados do CDI/),
    });
  });

  it("atualiza os índices (BCB falso) e mostra fonte e data", async () => {
    const r = await pedir(ana, "POST", "/renda-fixa/indicadores/atualizar");
    expect(r.statusCode).toBe(200);
    const cdi = r.json().series.find((s: { serie: string }) => s.serie === "CDI");
    expect(cdi).toMatchObject({
      codigoSgs: 12,
      ultimoDia: "2026-10-09",
      ultimoValor: "0.050788",
      erro: null,
    });
    expect(r.json().fonte).toMatch(/Banco Central/);
  });

  it("com índices: posição calculada, impostos e comparação com o CDI", async () => {
    const [t] = (await pedir(ana, "GET", "/renda-fixa/titulos")).json();
    expect(t.posicao).toMatchObject({
      disponivel: true,
      fonte: "indices",
      ate: "2026-10-10",
      aliquotaIrPct: "20",
    });
    expect(Number(t.posicao.percentualDoCdi)).toBeCloseTo(110, 1);
    expect(Number(t.posicao.bruto)).toBeGreaterThan(10_000);
    expect(Number(t.posicao.liquido)).toBeLessThan(Number(t.posicao.bruto));
  });

  it("detalhe traz a projeção com as premissas; a pessoa pode informar o CDI", async () => {
    const [t] = (await pedir(ana, "GET", "/renda-fixa/titulos")).json();
    const r = await pedir(ana, "GET", `/renda-fixa/titulos/${t.id}?cdi=10`);
    expect(r.statusCode).toBe(200);
    expect(r.json().projecao).toMatchObject({ disponivel: true, fim: "2028-01-15" });
    expect(r.json().projecao.premissas.join(" ")).toMatch(/CDI de 10% ao ano, informado por você/);
  });

  it("cada pessoa só vê os próprios títulos (RLS)", async () => {
    const [t] = (await pedir(ana, "GET", "/renda-fixa/titulos")).json();
    expect((await pedir(beto, "GET", `/renda-fixa/titulos/${t.id}`)).statusCode).toBe(404);
    expect((await pedir(beto, "GET", "/renda-fixa/titulos")).json()).toEqual([]);
    expect((await pedir(beto, "DELETE", `/renda-fixa/titulos/${t.id}`)).statusCode).toBe(404);
    expect((await pedir(beto, "GET", "/renda-fixa/titulos/nao-e-uuid")).statusCode).toBe(404);
  });

  it("altera com validação do título inteiro e recusa dado inválido", async () => {
    const [t] = (await pedir(ana, "GET", "/renda-fixa/titulos")).json();
    const ok = await pedir(ana, "PATCH", `/renda-fixa/titulos/${t.id}`, { nome: "CDB renomeado" });
    expect(ok.json().nome).toBe("CDB renomeado");
    const ruim = await pedir(ana, "PATCH", `/renda-fixa/titulos/${t.id}`, { indexador: "PREFIXADO" });
    expect(ruim.statusCode).toBe(400);
    expect(ruim.json().erro.mensagem).toMatch(/taxa anual/);
    const novo = await pedir(ana, "POST", "/renda-fixa/titulos", { ...CDB, valorAplicado: "-1" });
    expect(novo.statusCode).toBe(400);
  });

  it("resumo: totais, alocação, vencimentos, rendimento do mês e índices", async () => {
    await pedir(ana, "POST", "/renda-fixa/titulos", {
      tipo: "TESOURO_PREFIXADO",
      nome: "Tesouro Prefixado 2029",
      indexador: "PREFIXADO",
      taxaAnual: "12.5",
      dataAplicacao: "2026-03-02",
      vencimento: "2029-01-01",
      valorAplicado: "5000",
      liquidez: "vencimento",
    });
    const r = (await pedir(ana, "GET", "/renda-fixa/resumo")).json();
    expect(r).toMatchObject({ hoje: "2026-10-10", quantidade: 2, aplicado: "15000", indisponiveis: [] });
    expect(r.porTipo.map((a: { chave: string }) => a.chave).sort()).toEqual(["CDB", "TESOURO_PREFIXADO"]);
    expect(r.proximoVencimento).toMatchObject({ dia: "2028-01-15" });
    expect(Number(r.rendimentoMes)).toBeGreaterThan(0);
    expect(r.indicadores.series).toHaveLength(6);
  });

  it("regras com fonte e data; simuladores respondem com premissas", async () => {
    const regras = (await pedir(ana, "GET", "/renda-fixa/regras")).json();
    expect(regras.verificadoEm).toBe("2026-10-11");
    expect(regras.ir.faixas[0]).toEqual({ ateDias: 180, aliquotaPct: "22.5" });
    expect(regras.notas.join(" ")).toMatch(/1\.303/);
    const isento = await pedir(ana, "POST", "/renda-fixa/simular/isento", {
      direcao: "isento_para_tributado",
      percentualCdi: "90",
      prazoDias: 365,
      cdiAnual: "13.65",
    });
    expect(Number(isento.json().regraDeBolso)).toBeCloseTo(109.0909, 3);
    const selic = await pedir(ana, "POST", "/renda-fixa/simular/selic-cdb-poupanca", {
      valor: "20000",
      prazoDias: 365,
      selicAnual: "13.65",
      cdiAnual: "13.65",
      percentualCdb: "100",
      metaSelicAnual: "13.75",
      trMensal: "0.1",
    });
    expect(selic.statusCode).toBe(200);
    expect(selic.json().serie.length).toBeGreaterThan(10);
    const pre = await pedir(ana, "POST", "/renda-fixa/simular/pre-ipca", {
      valor: "10000",
      prazoDias: 1095,
      taxaPre: "12",
      taxaReal: "6",
      ipcaEsperado: "4",
    });
    expect(Number(pre.json().inflacaoEquilibrio)).toBeCloseTo(5.6604, 3);
  });

  it("Pluggy: estado, connect token, conectar, sincronizar e remover só aqui", async () => {
    expect((await pedir(ana, "GET", "/pluggy")).json()).toEqual({ configurada: true, itens: [] });
    const token = await pedir(ana, "POST", "/pluggy/connect-token", {});
    expect(token.json()).toEqual({ accessToken: "token-do-widget" });
    const conectado = await pedir(ana, "POST", "/pluggy/itens", { itemId: ITEM });
    expect(conectado.statusCode).toBe(201);
    expect(conectado.json()).toMatchObject({ novos: 1, ignorados: 1, item: { id: ITEM, titulos: 1 } });
    const titulos = (await pedir(ana, "GET", "/renda-fixa/titulos")).json();
    const daPluggy = titulos.find((t: { origem: string }) => t.origem === "pluggy");
    expect(daPluggy).toMatchObject({
      tipo: "CAIXINHA",
      grupo: "nubank-caixinha:100",
      posicao: { fonte: "instituicao", bruto: "1012" },
    });
    expect((await pedir(ana, "DELETE", `/renda-fixa/titulos/${daPluggy.id}`)).statusCode).toBe(409);
    const sinc = await pedir(ana, "POST", `/pluggy/itens/${ITEM}/sincronizar`, { pedirAoBanco: true });
    expect(sinc.json()).toMatchObject({ novos: 0, atualizados: 1 });
    expect((await pedir(beto, "POST", `/pluggy/itens/${ITEM}/sincronizar`, {})).statusCode).toBe(404);
    expect((await pedir(ana, "DELETE", `/pluggy/itens/${ITEM}`)).statusCode).toBe(204);
    expect((await pedir(ana, "GET", "/pluggy")).json().itens).toEqual([]);
  });

  it("item criado para outra pessoa é recusado", async () => {
    donoDoItem = "outra-pessoa";
    const r = await pedir(beto, "POST", "/pluggy/itens", { itemId: ITEM });
    expect(r.statusCode).toBe(403);
    donoDoItem = ana.id;
  });

  it("token de leitura lê, mas não cadastra nem pede connect token", async () => {
    const criado = await api.app.inject({
      method: "POST",
      url: "/api/v1/tokens",
      headers: comSessao(ana),
      payload: { nome: "cli", escopo: "leitura" },
    });
    const bearer = { authorization: `Bearer ${criado.json<{ token: string }>().token}` };
    expect(
      (await api.app.inject({ method: "GET", url: "/api/v1/renda-fixa/resumo", headers: bearer })).statusCode,
    ).toBe(200);
    const cadastrar = await api.app.inject({
      method: "POST",
      url: "/api/v1/renda-fixa/titulos",
      headers: bearer,
      payload: CDB,
    });
    expect(cadastrar.statusCode).toBe(403);
    const token = await api.app.inject({
      method: "POST",
      url: "/api/v1/pluggy/connect-token",
      headers: bearer,
      payload: {},
    });
    expect(token.json().erro.codigo).toBe("exige_sessao");
  });
});

describe("API sem os serviços de renda fixa", () => {
  let api: Api;
  let ana: Pessoa;
  beforeAll(async () => {
    api = await montarApi();
    ana = await api.pessoa("ana@exemplo.com");
  });
  afterAll(async () => api.encerrar());

  it("explica o que falta em vez de quebrar", async () => {
    const cab = comSessao(ana);
    expect((await api.app.inject({ method: "GET", url: "/api/v1/pluggy", headers: cab })).json()).toEqual({
      configurada: false,
      itens: [],
    });
    const conectar = await api.app.inject({
      method: "POST",
      url: "/api/v1/pluggy/itens",
      headers: cab,
      payload: { itemId: ITEM },
    });
    expect(conectar.statusCode).toBe(503);
    const atualizar = await api.app.inject({
      method: "POST",
      url: "/api/v1/renda-fixa/indicadores/atualizar",
      headers: cab,
    });
    expect(atualizar.json().erro.codigo).toBe("indicadores_indisponiveis");
    const resumo = await api.app.inject({ method: "GET", url: "/api/v1/renda-fixa/resumo", headers: cab });
    expect(resumo.json()).toMatchObject({
      quantidade: 0,
      bruto: "0",
      rendimentoMes: "0",
      proximoVencimento: null,
    });
  });
});
