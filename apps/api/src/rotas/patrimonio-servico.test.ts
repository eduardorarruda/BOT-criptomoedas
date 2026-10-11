import type { Carteira, ItemImobiliario, ResumoRendaFixa } from "@zentrade/contratos";
import { dec } from "@zentrade/dominio";
import { describe, expect, it } from "vitest";
import {
  avaliarCarteira,
  avaliarImobiliario,
  avaliarRendaFixa,
  montarPatrimonio,
} from "./patrimonio-servico.js";

const PRECOS_EM = Date.UTC(2026, 9, 11, 12, 0);

const moeda = (ativo: string, valorSaldo: string | null, saldo = "1") =>
  ({
    ativo,
    valorSaldo,
    referencia: ativo === "USDT",
    saldo: { livre: saldo, bloqueado: "0", total: saldo },
  }) as Carteira["moedas"][number];

const carteira = (sobrescrever: Partial<Carteira> = {}): Carteira =>
  ({
    conectada: true,
    rede: "real",
    redes: ["real"],
    moedaReferencia: "USDT",
    sincronizacao: { em: PRECOS_EM - 60_000, ok: true, erro: null, negociacoes: 3 },
    precosEm: PRECOS_EM,
    resumo: { valorConta: "1000", caixa: "100", valorSemCusto: "0" },
    moedas: [moeda("BTC", "900"), moeda("USDT", "100")],
    avisos: [],
    ...sobrescrever,
  }) as Carteira;

const CAMBIO = { preco: dec("5.5"), em: PRECOS_EM };

describe("cripto no patrimônio", () => {
  it("conta inteira (com caixa) convertida pelo câmbio; o custo em reais fica desconhecido", () => {
    const a = avaliarCarteira(carteira(), CAMBIO);
    expect(a).toMatchObject({
      classe: "cripto",
      situacao: "completa",
      investido: null,
      itens: 2,
      atualizadoEm: PRECOS_EM,
      moedaOrigem: { moeda: "USDT", valor: "1000" },
      avisos: [],
    });
    expect(a.valor?.toFixed()).toBe("5500");
  });

  it("sem câmbio: mostra em USDT e fica fora do total, sem inventar taxa", () => {
    const a = avaliarCarteira(carteira(), null);
    expect(a).toMatchObject({ situacao: "indisponivel", valor: null, moedaOrigem: { valor: "1000" } });
    expect(a.avisos.join(" ")).toMatch(/Sem cotação USDT\/BRL/);
  });

  it("moeda sem preço em USDT: entra o resto, e o aviso diz qual ficou de fora", () => {
    const a = avaliarCarteira(carteira({ moedas: [moeda("BTC", "900"), moeda("XYZ", null)] }), CAMBIO);
    expect(a.situacao).toBe("parcial");
    expect(a.avisos.join(" ")).toMatch(/XYZ sem preço em USDT/);
  });

  it("moeda zerada (vendida toda) não conta como item nem deixa o valor parcial", () => {
    const moedas = [moeda("BTC", "900"), moeda("XYZ", null, "0"), moeda("ETH", "0", "0")];
    expect(avaliarCarteira(carteira({ moedas }), CAMBIO)).toMatchObject({ situacao: "completa", itens: 1 });
  });

  it("preços da Binance indisponíveis: fora do total, com o motivo da carteira", () => {
    const motivo = "Preços atuais indisponíveis (Binance fora do ar).";
    const a = avaliarCarteira(carteira({ precosEm: null, avisos: [motivo] }), CAMBIO);
    expect(a).toMatchObject({ situacao: "indisponivel", valor: null, moedaOrigem: null, avisos: [motivo] });
  });

  it("conta real nunca sincronizada: não dá para saber o valor", () => {
    const a = avaliarCarteira(carteira({ sincronizacao: null, moedas: [] }), CAMBIO);
    expect(a).toMatchObject({ situacao: "indisponivel", valor: null });
    expect(a.avisos.join(" ")).toMatch(/ainda não sincronizada/);
  });

  it("conta sincronizada e vazia: classe vazia, valor zero", () => {
    const vazia = carteira({ moedas: [], resumo: { valorConta: "0" } as Carteira["resumo"] });
    expect(avaliarCarteira(vazia, CAMBIO)).toMatchObject({ situacao: "vazia", itens: 0 });
  });
});

const resumoRF = (sobrescrever: Partial<ResumoRendaFixa> = {}): ResumoRendaFixa =>
  ({
    quantidade: 2,
    indisponiveis: [],
    aplicado: "4000",
    bruto: "4210.55",
    indicadores: {
      fonte: "BCB",
      series: [
        { serie: "CDI", verificadoEm: PRECOS_EM - 1000 },
        { serie: "IPCA", verificadoEm: PRECOS_EM },
        { serie: "TR", verificadoEm: null },
      ],
    },
    ...sobrescrever,
  }) as ResumoRendaFixa;

describe("renda fixa no patrimônio", () => {
  it("valor bruto, aplicado como investido, e a última conferência dos índices", () => {
    const a = avaliarRendaFixa(resumoRF());
    expect(a).toMatchObject({ situacao: "completa", investido: "4000", itens: 2, atualizadoEm: PRECOS_EM });
    expect(a.valor?.toFixed()).toBe("4210.55");
  });

  it("título sem índice para a conta: parcial, ou indisponível se for todo mundo", () => {
    const parcial = avaliarRendaFixa(resumoRF({ indisponiveis: ["t1"] }));
    expect(parcial.situacao).toBe("parcial");
    expect(parcial.avisos.join(" ")).toMatch(/1 título sem índice ou taxa/);
    const nenhum = avaliarRendaFixa(resumoRF({ indisponiveis: ["t1", "t2"], bruto: "0", aplicado: "0" }));
    expect(nenhum).toMatchObject({ situacao: "indisponivel", valor: null, investido: null });
    expect(nenhum.avisos.join(" ")).toMatch(/2 títulos sem índice ou taxa/);
  });

  it("sem título e sem índice conferido: vazia e sem data", () => {
    const vazia = resumoRF({
      quantidade: 0,
      aplicado: "0",
      bruto: "0",
      indicadores: { fonte: "BCB", series: [] },
    });
    expect(avaliarRendaFixa(vazia)).toMatchObject({ situacao: "vazia", atualizadoEm: null, itens: 0 });
  });
});

const itemImob = (nome: string, atualizadoEm: number, erro: string | null = null): ItemImobiliario =>
  ({
    investimento: { nome, atualizadoEm },
    metricas: erro ? null : { patrimonioLiquido: "1" },
    erroMetricas: erro,
  }) as unknown as ItemImobiliario;

describe("imobiliário no patrimônio", () => {
  const visao = { patrimonio: "200000", investido: "195000", quantidade: 2 };

  it("patrimônio líquido (valor − dívida), investido e a última alteração do cadastro", () => {
    const a = avaliarImobiliario({ ...visao, itens: [itemImob("Apto", 10), itemImob("FII", 20)] });
    expect(a).toMatchObject({ situacao: "completa", investido: "195000", itens: 2, atualizadoEm: 20 });
    expect(a.valor?.toFixed()).toBe("200000");
  });

  it("investimento cujos lançamentos não fecham: fora do valor, com o motivo", () => {
    const a = avaliarImobiliario({
      ...visao,
      itens: [itemImob("Apto", 10), itemImob("REIT", 20, "informe o câmbio atual")],
    });
    expect(a.situacao).toBe("parcial");
    expect(a.avisos).toEqual(["“REIT” fora do valor: informe o câmbio atual."]);
  });

  it("nada cadastrado: vazia", () => {
    expect(avaliarImobiliario({ patrimonio: "0", investido: "0", quantidade: 0, itens: [] })).toMatchObject({
      situacao: "vazia",
      atualizadoEm: null,
    });
  });
});

describe("patrimônio montado", () => {
  it("total em reais aos centavos, fatias em fração e aviso quando o total não inclui tudo", () => {
    const p = montarPatrimonio({
      agora: PRECOS_EM,
      cambio: { preco: dec("5.5"), em: PRECOS_EM },
      classes: [
        avaliarCarteira(carteira(), null),
        avaliarRendaFixa(resumoRF()),
        avaliarImobiliario({ patrimonio: "0", investido: "0", quantidade: 0, itens: [] }),
      ],
    });
    expect(p).toMatchObject({
      moeda: "BRL",
      total: "4210.55",
      parcial: true,
      calculadoEm: PRECOS_EM,
      cambio: { par: "USDTBRL", preco: "5.5", em: PRECOS_EM, fonte: "binance" },
    });
    expect(p.classes.map((c) => [c.classe, c.situacao, c.valor, c.fracao])).toEqual([
      ["cripto", "indisponivel", null, null],
      ["renda_fixa", "completa", "4210.55", "1"],
      ["imobiliario", "vazia", "0", null],
    ]);
    expect(p.avisos.join(" ")).toMatch(/não inclui tudo/);
  });

  it("tudo avaliado: sem aviso geral e fatias com até 6 casas", () => {
    const p = montarPatrimonio({
      agora: PRECOS_EM,
      cambio: null,
      classes: [
        avaliarRendaFixa(resumoRF({ bruto: "1" })),
        avaliarImobiliario({ patrimonio: "2", investido: "2", quantidade: 1, itens: [itemImob("A", 1)] }),
      ],
    });
    expect(p).toMatchObject({ total: "3", parcial: false, cambio: null, avisos: [] });
    expect(p.classes.map((c) => c.fracao)).toEqual(["0.333333", "0.666667"]);
  });
});
