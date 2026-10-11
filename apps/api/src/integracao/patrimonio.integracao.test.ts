import { Disjuntor } from "@zentrade/corretora";
import { PatrimonioEsquema, type Patrimonio } from "@zentrade/contratos";
import { dec } from "@zentrade/dominio";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fabricaContaBinance } from "../integracoes/binance-conta.js";
import { criarServicoCarteira } from "../integracoes/binance-carteira.js";
import { comSessao, montarApi, type Api, type Pessoa } from "./ajuda.js";
import { estadoInicial, fetchDaBinanceFalsa } from "./binance-falsa.js";

const AGORA = Date.parse("2026-10-10T15:00:00Z");

/** Prefixado: a conta não depende de índice do Banco Central. */
const PREFIXADO = {
  tipo: "CDB",
  nome: "CDB Prefixado 12%",
  emissor: "Banco Y",
  indexador: "PREFIXADO",
  taxaAnual: "12",
  dataAplicacao: "2026-01-15",
  vencimento: "2028-01-15",
  valorAplicado: "5000.00",
  liquidez: "vencimento",
};

/** Pós-fixado sem o CDI no banco: a renda fixa não consegue calcular este. */
const POS_SEM_CDI = {
  ...PREFIXADO,
  nome: "CDB 110% CDI",
  indexador: "CDI",
  taxaAnual: null,
  percentualIndexador: "110",
};

const APARTAMENTO = {
  tipo: "aluguel",
  nome: "Apto Centro",
  valorAtual: "520000",
  lancamentosIniciais: [{ data: "2025-01-10", tipo: "aporte", categoria: "compra", valor: "480000" }],
};

describe("patrimônio consolidado pela API (Binance simulada, banco e Redis reais)", () => {
  let api: Api;
  let ana: Pessoa;
  let beto: Pessoa;
  const binance = estadoInicial(AGORA);
  binance.saldos = [
    { asset: "BTC", free: "0.01", locked: "0" },
    { asset: "USDT", free: "100", locked: "0" },
  ];
  binance.precos = { BTCUSDT: "70000", USDTBRL: "5.5" };

  const chamar = (p: Pessoa, method: "GET" | "POST", url: string, payload?: object) =>
    api.app.inject({ method, url: `/api/v1${url}`, headers: comSessao(p), ...(payload ? { payload } : {}) });
  const patrimonio = async (p: Pessoa): Promise<Patrimonio> => {
    const r = await chamar(p, "GET", "/patrimonio/consolidado");
    expect(r.statusCode).toBe(200);
    return PatrimonioEsquema.parse(r.json());
  };
  const classe = (p: Patrimonio, nome: string) => p.classes.find((c) => c.classe === nome)!;
  const conta = (p: Pessoa, rede: "testnet" | "real") =>
    chamar(p, "POST", "/contas-corretora", {
      corretora: "binance",
      rede,
      apiKey: `chave-de-teste-${rede}`,
      apiSecret: `segredo-de-teste-${rede}`,
    });

  beforeAll(async () => {
    api = await montarApi({
      ambiente: { CARTEIRA_SINCRONIZAR_MIN: "0" },
      carteira: (banco, agora) =>
        criarServicoCarteira({
          banco,
          agora,
          // Sem cache de preços: cada teste vê a tabela que montou.
          validadePrecosMs: 0,
          criarConta: fabricaContaBinance({
            disjuntorDe: () => new Disjuntor(),
            fetch: fetchDaBinanceFalsa(binance),
            agora: () => binance.agora,
            dormir: async () => undefined,
          }),
        }),
    });
    api.relogio.t = AGORA;
    ana = await api.pessoa("ana.patrimonio@exemplo.com");
    beto = await api.pessoa("beto.patrimonio@exemplo.com");
  });
  afterAll(async () => api.encerrar());

  it("sem sessão: 401", async () => {
    const r = await api.app.inject({ method: "GET", url: "/api/v1/patrimonio/consolidado" });
    expect(r.statusCode).toBe(401);
  });

  it("nada cadastrado: total zero, três classes vazias, nada parcial", async () => {
    const p = await patrimonio(ana);
    expect(p).toMatchObject({ moeda: "BRL", total: "0", parcial: false, cambio: null, avisos: [] });
    expect(p.classes.map((c) => [c.classe, c.situacao, c.fracao])).toEqual([
      ["cripto", "vazia", null],
      ["renda_fixa", "vazia", null],
      ["imobiliario", "vazia", null],
    ]);
  });

  it("só testnet: a cripto fica fora (dinheiro de teste) e diz por quê", async () => {
    expect((await conta(ana, "testnet")).statusCode).toBe(201);
    const c = classe(await patrimonio(ana), "cripto");
    expect(c).toMatchObject({ situacao: "vazia", valor: "0" });
    expect(c.avisos.join(" ")).toMatch(/testnet/);
  });

  it("conta real ainda não sincronizada: cripto indisponível e o total avisa que é parcial", async () => {
    await api.ativar2fa(ana); // chave de dinheiro real exige 2FA
    expect((await conta(ana, "real")).statusCode).toBe(201);
    const p = await patrimonio(ana);
    expect(classe(p, "cripto")).toMatchObject({ situacao: "indisponivel", valor: null });
    expect(p.parcial).toBe(true);
  });

  it("as três classes somadas com os mesmos números das telas de cada uma", async () => {
    expect((await chamar(ana, "POST", "/carteira/sincronizar", { rede: "real" })).statusCode).toBe(200);
    expect((await chamar(ana, "POST", "/renda-fixa/titulos", PREFIXADO)).statusCode).toBe(201);
    expect((await chamar(ana, "POST", "/imobiliario/investimentos", APARTAMENTO)).statusCode).toBe(201);

    const p = await patrimonio(ana);
    const carteira = (await chamar(ana, "GET", "/carteira?rede=real")).json();
    const rf = (await chamar(ana, "GET", "/renda-fixa/resumo")).json();
    const imob = (await chamar(ana, "GET", "/imobiliario")).json();

    // 0,01 BTC × 70000 + 100 USDT = 800 USDT; × 5,5 = R$ 4.400.
    expect(carteira.resumo.valorConta).toBe("800");
    expect(classe(p, "cripto")).toMatchObject({
      situacao: "completa",
      valor: "4400",
      investido: null,
      itens: 2,
      moedaOrigem: { moeda: "USDT", valor: "800" },
    });
    expect(p.cambio).toMatchObject({ par: "USDTBRL", preco: "5.5", fonte: "binance" });
    expect(classe(p, "renda_fixa")).toMatchObject({
      situacao: "completa",
      valor: rf.bruto,
      investido: "5000",
      itens: 1,
    });
    expect(classe(p, "imobiliario")).toMatchObject({
      situacao: "completa",
      valor: "520000",
      investido: imob.investido,
      itens: 1,
    });
    const soma = dec("4400").plus(dec(rf.bruto)).plus(dec(imob.patrimonio));
    expect(p.total).toBe(soma.toFixed());
    expect(p.parcial).toBe(false);
    const somaFracoes = p.classes.reduce((s, c) => s.plus(dec(c.fracao ?? "0")), dec(0));
    expect(somaFracoes.minus(1).abs().lte("0.000002")).toBe(true);
  });

  it("sem o par USDTBRL: cripto só em USDT, fora do total, sem câmbio inventado", async () => {
    binance.precos = { BTCUSDT: "70000" };
    const p = await patrimonio(ana);
    expect(p.cambio).toBeNull();
    expect(p.parcial).toBe(true);
    const c = classe(p, "cripto");
    expect(c).toMatchObject({ situacao: "indisponivel", valor: null, fracao: null });
    expect(c.moedaOrigem).toEqual({ moeda: "USDT", valor: "800" });
    expect(c.avisos.join(" ")).toMatch(/Sem cotação USDT\/BRL/);
    expect(p.total).toBe(dec(classe(p, "renda_fixa").valor!).plus(520000).toFixed());
    binance.precos = { BTCUSDT: "70000", USDTBRL: "5.5" };
  });

  it("título sem índice: renda fixa parcial, com o aviso", async () => {
    expect((await chamar(ana, "POST", "/renda-fixa/titulos", POS_SEM_CDI)).statusCode).toBe(201);
    const p = await patrimonio(ana);
    const rf = classe(p, "renda_fixa");
    expect(rf).toMatchObject({ situacao: "parcial", itens: 2 });
    expect(rf.avisos.join(" ")).toMatch(/1 título sem índice ou taxa/);
    expect(p.parcial).toBe(true);
  });

  it("Binance sem preços legíveis: cripto indisponível com o motivo, o resto continua", async () => {
    binance.precos = { BTCUSDT: "não é número", USDTBRL: "5.5" };
    const p = await patrimonio(ana);
    binance.precos = { BTCUSDT: "70000", USDTBRL: "5.5" };
    const c = classe(p, "cripto");
    expect(c).toMatchObject({ situacao: "indisponivel", valor: null, moedaOrigem: null });
    expect(c.avisos.join(" ")).toMatch(/Preços atuais indisponíveis/);
    expect(classe(p, "imobiliario").valor).toBe("520000");
  });

  it("isolamento: outra pessoa não vê nada do patrimônio da primeira", async () => {
    const p = await patrimonio(beto);
    expect(p.total).toBe("0");
    expect(p.classes.every((c) => c.situacao === "vazia")).toBe(true);
  });
});
