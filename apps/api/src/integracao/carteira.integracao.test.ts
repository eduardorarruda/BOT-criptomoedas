import { Disjuntor } from "@zentrade/corretora";
import { CarteiraAtivoEsquema, CarteiraEsquema, StatusBinanceEsquema } from "@zentrade/contratos";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fabricaContaBinance } from "../integracoes/binance-conta.js";
import { criarServicoCarteira } from "../integracoes/binance-carteira.js";
import { comSessao, montarApi, type Api, type Pessoa } from "./ajuda.js";
import { estadoInicial, fetchDaBinanceFalsa, type EstadoBinanceFalsa } from "./binance-falsa.js";

const AGORA = Date.UTC(2026, 9, 11, 12, 0);

function popular(e: EstadoBinanceFalsa): void {
  e.saldos = [
    { asset: "BTC", free: "0.01", locked: "0.005" },
    { asset: "BNB", free: "0.9989", locked: "0" },
    { asset: "USDT", free: "100", locked: "0" },
  ];
  e.negociacoes = {
    BTCUSDT: [
      {
        id: 1,
        orderId: 11,
        price: "50000",
        qty: "0.01",
        commission: "0.00001",
        commissionAsset: "BTC",
        time: AGORA - 3000,
        isBuyer: true,
      },
      {
        id: 2,
        orderId: 12,
        price: "40000",
        qty: "0.01",
        commission: "0.0001",
        commissionAsset: "BNB",
        time: AGORA - 2000,
        isBuyer: true,
      },
      {
        id: 3,
        orderId: 13,
        price: "60000",
        qty: "0.005",
        commission: "0.3",
        commissionAsset: "USDT",
        time: AGORA - 1000,
        isBuyer: false,
      },
    ],
    BNBUSDT: [
      {
        id: 7,
        orderId: 21,
        price: "500",
        qty: "1",
        commission: "0.001",
        commissionAsset: "BNB",
        time: AGORA - 5000,
        isBuyer: true,
      },
    ],
  };
  e.ordens = { 11: "zt-robo-1", 12: "web_manual", 13: "zt-robo-2", 21: "and_app" };
  e.precos = { BTCUSDT: "70000", BNBUSDT: "650", ETHUSDT: "3000" };
  e.velas = { BNBUSDT: "600" };
}

describe("carteira da Binance pela API (Binance simulada, banco e Redis reais)", () => {
  let api: Api;
  let ana: Pessoa;
  let beto: Pessoa;
  const binance = estadoInicial(AGORA);
  popular(binance);

  const chamar = (p: Pessoa, method: "GET" | "POST", url: string, payload?: object) =>
    api.app.inject({ method, url: `/api/v1${url}`, headers: comSessao(p), ...(payload ? { payload } : {}) });

  beforeAll(async () => {
    api = await montarApi({
      ambiente: { CARTEIRA_SINCRONIZAR_MIN: "0" },
      carteira: (banco, agora) =>
        criarServicoCarteira({
          banco,
          agora,
          criarConta: fabricaContaBinance({
            // Cada teste com o próprio disjuntor: um 429 simulado não bloqueia os seguintes.
            disjuntorDe: () => new Disjuntor(),
            fetch: fetchDaBinanceFalsa(binance),
            agora: () => binance.agora,
            dormir: async () => undefined,
          }),
        }),
    });
    ana = await api.pessoa("ana@exemplo.com");
    beto = await api.pessoa("beto@exemplo.com");
  });
  afterAll(async () => api.encerrar());

  it("sem conta: carteira desconectada, que explica em vez de inventar zero", async () => {
    const r = await chamar(ana, "GET", "/carteira");
    expect(r.statusCode).toBe(200);
    expect(CarteiraEsquema.parse(r.json())).toMatchObject({ conectada: false, redes: [], moedas: [] });
    expect((await chamar(ana, "POST", "/carteira/sincronizar", {})).json()).toMatchObject({
      erro: { codigo: "conta_nao_encontrada" },
    });
  });

  it("com conta e antes de sincronizar: conectada, avisa que falta sincronizar", async () => {
    const conta = await chamar(ana, "POST", "/contas-corretora", {
      corretora: "binance",
      rede: "testnet",
      apiKey: "chave-de-teste-da-ana",
      apiSecret: "segredo-de-teste-da-ana",
    });
    expect(conta.statusCode).toBe(201);
    const c = CarteiraEsquema.parse((await chamar(ana, "GET", "/carteira")).json());
    expect(c).toMatchObject({ conectada: true, rede: "testnet", redes: ["testnet"], sincronizacao: null });
    expect(c.avisos.join(" ")).toMatch(/Sincronizar agora/);
  });

  it("sincroniza saldos e negociações; de novo, não duplica", async () => {
    const r = await chamar(ana, "POST", "/carteira/sincronizar", {});
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ rede: "testnet", negociacoesNovas: 4, saldos: 3, parcial: false });
    expect(r.json<{ simbolos: string[] }>().simbolos).toEqual(["BNBUSDT", "BTCUSDT"]);
    const deNovo = await chamar(ana, "POST", "/carteira/sincronizar");
    expect(deNovo.json()).toMatchObject({ negociacoesNovas: 0, parcial: false });
  });

  it("carteira calculada: origem robô × manual, taxas convertidas para USDT, saldo sem custo", async () => {
    const c = CarteiraEsquema.parse((await chamar(ana, "GET", "/carteira")).json());
    expect(c.sincronizacao).toMatchObject({ ok: true });
    expect(c.moedas.map((m) => m.ativo)).toEqual(["BTC", "BNB", "USDT"]);
    const btc = c.moedas[0]!;
    expect(btc.preco).toBe("70000");
    expect([btc.total.negociacoes, btc.robo.negociacoes, btc.manual.negociacoes]).toEqual([3, 2, 1]);
    // 0,00001 BTC × 50000 + 0,0001 BNB × 600 + 0,3 USDT
    expect(btc.total.taxas).toBe("0.86");
    expect(btc.total.quantidade).toBe("0.01499");
    expect(btc.quantidadeSemCusto).toBe("0.00001");
    expect(btc.avisos.join(" ")).toMatch(/custo desconhecido/);
    const bnb = c.moedas[1]!;
    expect(bnb.total.quantidade).toBe("0.9989");
    expect(c.resumo.caixa).toBe("100");
    expect(c.precosEm).not.toBeNull();
  });

  it("detalhe da moeda traz as negociações, a mais recente primeiro", async () => {
    const r = await chamar(ana, "GET", "/carteira/BTC");
    expect(r.statusCode).toBe(200);
    const d = CarteiraAtivoEsquema.parse(r.json());
    expect(d.negociacoes.map((n) => [n.id, n.lado, n.origem])).toEqual([
      ["BTCUSDT:3", "VENDA", "robo"],
      ["BTCUSDT:2", "COMPRA", "manual"],
      ["BTCUSDT:1", "COMPRA", "robo"],
    ]);
    expect(d.negociacoes[1]).toMatchObject({ ativoTaxa: "BNB", taxaUsdt: "0.06" });
    expect((await chamar(ana, "GET", "/carteira/XYZ")).statusCode).toBe(404);
    expect((await chamar(ana, "GET", "/carteira/btc")).statusCode).toBe(400);
    expect((await chamar(ana, "GET", "/carteira?rede=real")).json()).toMatchObject({
      erro: { codigo: "conta_nao_encontrada" },
    });
  });

  it("uma pessoa não vê a carteira da outra", async () => {
    expect((await chamar(beto, "GET", "/carteira")).json()).toMatchObject({ conectada: false });
    expect((await chamar(beto, "GET", "/carteira/BTC")).statusCode).toBe(404);
  });

  it("limite da Binance (429) no meio: o que entrou fica e a sincronização sai parcial", async () => {
    binance.saldos = [...binance.saldos, { asset: "ETH", free: "1", locked: "0" }];
    binance.negociacoes.ETHUSDT = [
      {
        id: 1,
        orderId: 31,
        price: "3000",
        qty: "1",
        commission: "3",
        commissionAsset: "USDT",
        time: AGORA,
        isBuyer: true,
      },
    ];
    binance.limiteEm.add("ETHUSDT");
    const r = await chamar(ana, "POST", "/carteira/sincronizar", { simbolos: ["NAOEXISTE"] });
    expect(r.json()).toMatchObject({ parcial: true, negociacoesNovas: 0 });
    expect(r.json<{ avisos: string[] }>().avisos.join(" ")).toMatch(
      /NAOEXISTE.*não existe[\s\S]*Parou em ETHUSDT/,
    );
    const c = CarteiraEsquema.parse((await chamar(ana, "GET", "/carteira")).json());
    expect(c.sincronizacao).toMatchObject({ ok: false });
    binance.limiteEm.clear();
  });

  it("status: conectada; na testnet as permissões da chave são desconhecidas", async () => {
    expect((await api.app.inject({ method: "GET", url: "/api/v1/binance/status" })).statusCode).toBe(401);
    const s = StatusBinanceEsquema.parse((await chamar(ana, "GET", "/binance/status")).json());
    expect(s.contas).toHaveLength(1);
    expect(s.contas[0]).toMatchObject({
      rede: "testnet",
      conectada: true,
      podeNegociar: true,
      podeSacar: null,
      permissoesLidas: false,
    });
    expect(s.contas[0]!.avisos.join(" ")).toMatch(/testnet não informa/);
  });

  it("rede real: lê as permissões e avisa da permissão de saque", async () => {
    await api.ativar2fa(ana);
    const r = await chamar(ana, "POST", "/contas-corretora", {
      corretora: "binance",
      rede: "real",
      apiKey: "chave-real-de-teste",
      apiSecret: "segredo-real-de-teste",
    });
    expect(r.statusCode).toBe(201);
    binance.restricoes = { ...binance.restricoes, enableWithdrawals: true, ipRestrict: false };
    const s = StatusBinanceEsquema.parse((await chamar(ana, "GET", "/binance/status")).json());
    const real = s.contas.find((c) => c.rede === "real")!;
    expect(real).toMatchObject({
      conectada: true,
      podeSacar: true,
      ipRestrito: false,
      permissoesLidas: true,
    });
    expect(real.avisos.join(" ")).toMatch(/SAQUE/);
    // Com conta real, a carteira padrão é a real.
    expect((await chamar(ana, "GET", "/carteira")).json()).toMatchObject({
      rede: "real",
      redes: ["testnet", "real"],
    });
  });

  it("chave recusada pela Binance: erro explicado na sincronização e no status", async () => {
    binance.chaveInvalida = true;
    const r = await chamar(ana, "POST", "/carteira/sincronizar", { rede: "testnet" });
    expect(r.statusCode).toBe(502);
    expect(r.json()).toMatchObject({ erro: { codigo: "binance_recusou" } });
    const s = StatusBinanceEsquema.parse((await chamar(ana, "GET", "/binance/status")).json());
    expect(s.contas.every((c) => !c.conectada && c.erro !== null)).toBe(true);
    binance.chaveInvalida = false;
  });

  it("escrita sem CSRF é recusada; nada do segredo aparece nas respostas", async () => {
    const semCsrf = await api.app.inject({
      method: "POST",
      url: "/api/v1/carteira/sincronizar",
      headers: { cookie: ana.cookie },
    });
    expect(semCsrf.statusCode).toBe(403);
    const tudo = JSON.stringify([
      (await chamar(ana, "GET", "/carteira?rede=testnet")).json(),
      (await chamar(ana, "GET", "/binance/status")).json(),
    ]);
    expect(tudo).not.toMatch(/segredo-de-teste|chave-de-teste-da-ana/);
  });
});
