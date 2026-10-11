import { ToolError } from "@anthropic-ai/sdk/lib/tools/ToolError";
import type { LinhaTitulo, NegociacaoCarteiraLida, RegistroImobiliario } from "@zentrade/banco";
import type { InvestimentoImobiliario } from "@zentrade/contratos";
import { dec } from "@zentrade/dominio";
import { describe, expect, it, vi } from "vitest";
import { executarFerramenta, mensagemDeFalha, paraAnthropic } from "../../ferramentas/index.js";
import { investimentosFalsos } from "../../teste/investimentos-falsos.js";
import { USUARIO_TESTE } from "../../teste/pedido.js";
import { ferramentasDeInvestimentos, type LeituraInvestimentos } from "./index.js";

const MINUTO = 60_000;
/** 11/10/2026 12:00 UTC (9:00 em Brasília). */
const AGORA = Date.UTC(2026, 9, 11, 12, 0);

const negociacao = (
  id: number,
  lado: "COMPRA" | "VENDA",
  quantidade: string,
  preco: string,
): NegociacaoCarteiraLida => ({
  id: `BTCUSDT:${id}`,
  simbolo: "BTCUSDT",
  base: "BTC",
  cotacao: "USDT",
  idNegociacao: id,
  idOrdem: String(1000 + id),
  idCliente: null,
  origem: "manual",
  lado,
  preco: dec(preco),
  quantidade: dec(quantidade),
  valorCotacao: dec(quantidade).times(preco),
  taxa: dec("0.5"),
  ativoTaxa: "USDT",
  cotacaoUsdt: dec(1),
  taxaUsdt: dec("0.5"),
  em: AGORA - (10 - id) * 86_400_000,
});

const titulo = (extra: Partial<LinhaTitulo>): LinhaTitulo => ({
  id: "t-1",
  origem: "manual",
  itemId: null,
  grupo: null,
  tipo: "CDB",
  nome: "CDB Banco X",
  emissor: "Banco X",
  indexador: "PREFIXADO",
  percentualIndexador: null,
  taxaAnual: "12",
  dataAplicacao: "2026-01-15",
  vencimento: "2028-01-15",
  carenciaAte: null,
  valorAplicado: "10000",
  liquidez: "vencimento",
  informado: null,
  situacao: "ativo",
  atualizadoEm: Date.UTC(2026, 0, 15, 13, 0),
  ...extra,
});

const investimento = (extra: Partial<InvestimentoImobiliario>): InvestimentoImobiliario => ({
  id: "i-1",
  tipo: "aluguel",
  moeda: "BRL",
  nome: "Apto Centro",
  ticker: null,
  observacoes: "anotação longa que não precisa ir para o modelo",
  valorAtual: "450000",
  valorAtualEm: "2026-09-01",
  cambioAtual: null,
  valorizacaoAnual: null,
  aluguelPrevisto: null,
  taxaAdministracao: null,
  diaria: null,
  ocupacao: null,
  taxaPlataforma: null,
  precoVendaAlvo: null,
  prazoMeses: null,
  dataEntrega: null,
  valorCarta: null,
  fundoReserva: null,
  contempladoEm: null,
  financiamento: null,
  criadoEm: Date.UTC(2025, 0, 10),
  atualizadoEm: Date.UTC(2026, 8, 1, 15, 30),
  ...extra,
});

const lancamento = (data: string, tipo: "aporte" | "receita" | "resgate", valor: string, extra = {}) => ({
  id: `l-${data}-${tipo}`,
  investimentoId: "i-1",
  data,
  tipo,
  categoria: "outros",
  valor,
  quantidade: null,
  cambio: null,
  descricao: null,
  criadoEm: 1,
  ...extra,
});

function montar(dados: Partial<LeituraInvestimentos> = {}) {
  const d = investimentosFalsos(dados);
  const lista = ferramentasDeInvestimentos({ usuarioId: USUARIO_TESTE, agora: () => AGORA }, d);
  const ferramenta = (nome: string) => lista.find((f) => f.nome === nome)!;
  const rodar = async (nome: string, entrada: unknown = {}) => {
    const r = await executarFerramenta(ferramenta(nome), entrada);
    return { ...r, dados: r.ok ? (JSON.parse(r.texto) as Record<string, unknown>) : null };
  };
  return { d, lista, ferramenta, rodar };
}

/** BTC: comprou 0,01 a 50.000, vendeu 0,004 a 60.000 (taxa de 0,5 USDT em cada); 1.000 USDT em caixa. */
const carteiraReal = (extra: Partial<LeituraInvestimentos> = {}) =>
  montar({
    redesCarteira: vi.fn(async () => ["real" as const, "testnet" as const]),
    saldosCarteira: vi.fn(async () => [
      { ativo: "BTC", livre: dec("0.006"), bloqueado: dec(0) },
      { ativo: "USDT", livre: dec("1000"), bloqueado: dec(0) },
    ]),
    negociacoesCarteira: vi.fn(async () => [
      negociacao(1, "COMPRA", "0.01", "50000"),
      negociacao(2, "VENDA", "0.004", "60000"),
    ]),
    sincronizacaoCarteira: vi.fn(async () => ({
      em: AGORA - 5 * MINUTO,
      ok: true,
      erro: null,
      negociacoes: 2,
      simbolos: ["BTCUSDT"],
    })),
    ultimosPrecos: vi.fn(async () => new Map([["BTCUSDT", { preco: "65000", em: AGORA - 2 * MINUTO }]])),
    ...extra,
  });

describe("ferramentas de investimentos do assistente", () => {
  it("são só de leitura, com descrição em português e nenhum campo de pessoa na entrada", () => {
    const { lista } = montar();
    expect(lista.map((f) => f.nome)).toEqual(["carteira_cripto", "renda_fixa", "investimentos_imobiliarios"]);
    for (const f of lista) {
      expect(f.nome).not.toMatch(/comprar|vender|resgatar|aplicar|ordem/);
      expect(f.descricao).toMatch(/atualizado|sincroniz|posição de hoje|data-base/i);
      expect(Object.keys(f.entrada.shape)).not.toContain("usuarioId");
    }
  });
});

describe("carteira_cripto", () => {
  it("por moeda: saldo, investido, comprado, vendido, resultado bruto e líquido, taxas e valor atual", async () => {
    const { rodar, d } = carteiraReal();
    const r = await rodar("carteira_cripto");
    expect(r.ok).toBe(true);
    expect(d.redesCarteira).toHaveBeenCalledWith(USUARIO_TESTE);
    expect(d.saldosCarteira).toHaveBeenCalledWith(USUARIO_TESTE, "real");
    expect(d.negociacoesCarteira).toHaveBeenCalledWith(USUARIO_TESTE, "real");
    expect(d.ultimosPrecos).toHaveBeenCalledWith(expect.arrayContaining(["BTCUSDT"]), AGORA - 60 * MINUTO);
    expect(r.dados).toMatchObject({
      moeda: "USDT",
      conectada: true,
      rede: "real",
      redes: ["real", "testnet"],
      sincronizacao: { em: "2026-10-11 11:55 UTC", ok: true, erro: null },
      precos: { maisAntigoEm: "2026-10-11 11:58 UTC", fonte: expect.stringMatching(/candle de 1 minuto/) },
      resumo: { caixa: "1000", valorConta: "1390" },
      omitidas: 0,
    });
    const moedas = r.dados!["moedas"] as Record<string, unknown>[];
    expect(moedas.map((m) => m["ativo"])).toEqual(["BTC"]);
    expect(moedas[0]).toMatchObject({
      ativo: "BTC",
      saldo: "0.006",
      preco: "65000",
      valorAtual: "390",
      quantidadeComprada: "0.01",
      quantidadeVendida: "0.004",
      valorVendido: "240",
      taxas: "1",
    });
    for (const campo of [
      "investido",
      "precoMedio",
      "resultadoRealizadoBruto",
      "resultadoRealizadoLiquido",
      "resultadoNaoRealizado",
      "resultadoBruto",
      "resultadoLiquido",
      "retornoPct",
    ])
      expect(typeof moedas[0]![campo], campo).toBe("string");
  });

  it("aceita outra rede, filtra por moeda, limita as linhas e ignora um usuarioId vindo do modelo", async () => {
    const { rodar, d } = carteiraReal();
    const r = await rodar("carteira_cripto", { rede: "testnet", ativo: "ETH", usuarioId: "outra-pessoa" });
    expect(d.saldosCarteira).toHaveBeenCalledWith(USUARIO_TESTE, "testnet");
    expect(d.redesCarteira).not.toHaveBeenCalledWith("outra-pessoa");
    expect(r.dados).toMatchObject({
      moedas: [],
      avisos: expect.arrayContaining([expect.stringMatching(/ETH/)]),
    });
    const comEth = carteiraReal({
      saldosCarteira: vi.fn(async () => [
        { ativo: "BTC", livre: dec("0.006"), bloqueado: dec(0) },
        { ativo: "ETH", livre: dec("1"), bloqueado: dec(0) },
      ]),
    });
    const limitada = await comEth.rodar("carteira_cripto", { limite: 1 });
    expect((limitada.dados!["moedas"] as { ativo: string }[]).map((m) => m.ativo)).toEqual(["BTC"]);
    expect(limitada.dados).toMatchObject({ omitidas: 1 });
    expect((await rodar("carteira_cripto", { ativo: "btc" })).ok).toBe(false);
    expect((await rodar("carteira_cripto", { limite: 500 })).ok).toBe(false);
    expect((await rodar("carteira_cripto", { rede: "papel" })).ok).toBe(false);
  });

  it("sem preço recente, valor atual fica desconhecido e o aviso diz por quê", async () => {
    const { rodar } = carteiraReal({ ultimosPrecos: vi.fn(async () => new Map()) });
    const r = await rodar("carteira_cripto");
    const [btc] = r.dados!["moedas"] as Record<string, unknown>[];
    expect(btc).toMatchObject({ preco: null, valorAtual: null, resultadoNaoRealizado: null });
    expect(r.dados).toMatchObject({
      precos: { maisAntigoEm: null },
      avisos: expect.arrayContaining([expect.stringMatching(/sem preço/i)]),
    });
  });

  it("sem conta na Binance, ou numa rede sem conta, explica em vez de inventar", async () => {
    const semConta = await montar().rodar("carteira_cripto");
    expect(semConta.dados).toEqual({
      conectada: false,
      aviso: expect.stringMatching(/Nenhuma conta da Binance/),
    });
    const { rodar, d } = montar({ redesCarteira: vi.fn(async () => ["testnet" as const]) });
    const r = await rodar("carteira_cripto", { rede: "real" });
    expect(r.dados).toEqual({
      conectada: false,
      redes: ["testnet"],
      aviso: expect.stringMatching(/rede real/),
    });
    expect(d.saldosCarteira).not.toHaveBeenCalled();
  });

  it("conta ainda não sincronizada vira aviso", async () => {
    const { rodar } = carteiraReal({ sincronizacaoCarteira: vi.fn(async () => null) });
    const r = await rodar("carteira_cripto");
    expect(r.dados).toMatchObject({
      sincronizacao: null,
      avisos: expect.arrayContaining([expect.stringMatching(/não sincronizada/)]),
    });
  });
});

describe("renda_fixa", () => {
  const pluggy = titulo({
    id: "t-2",
    origem: "pluggy",
    nome: "CDB Nubank",
    emissor: "Nu Financeira",
    indexador: "CDI",
    percentualIndexador: "100",
    taxaAnual: null,
    dataAplicacao: "2026-03-01",
    vencimento: null,
    valorAplicado: "1000",
    liquidez: "diaria",
    informado: { em: "2026-10-10", bruto: "1080.55", liquido: "1066.43", ir: "14.12", iof: "0" },
    atualizadoEm: Date.UTC(2026, 9, 10, 6, 0),
  });
  const semIndice = titulo({
    id: "t-3",
    nome: "LCI Banco Y",
    tipo: "LCI",
    indexador: "CDI",
    percentualIndexador: "95",
    taxaAnual: null,
    valorAplicado: "500",
  });

  it("títulos manuais e da Pluggy com a posição de hoje, os totais e quando foi atualizado", async () => {
    const { rodar, d } = montar({
      titulosRendaFixa: vi.fn(async () => [titulo({}), pluggy, semIndice]),
    });
    const r = await rodar("renda_fixa");
    expect(d.titulosRendaFixa).toHaveBeenCalledWith(USUARIO_TESTE);
    expect(d.indicador).toHaveBeenCalledWith("CDI", expect.stringMatching(/^2024-12/));
    expect(r.dados).toMatchObject({
      moeda: "BRL",
      hoje: "2026-10-11",
      totais: { quantidade: 3, indisponiveis: 1 },
      omitidos: 0,
    });
    const titulos = r.dados!["titulos"] as Record<string, unknown>[];
    expect(titulos.map((t) => t["id"])).toEqual(["t-1", "t-2", "t-3"]);
    expect(titulos[0]).toMatchObject({
      nome: "CDB Banco X",
      origem: "manual",
      rendimento: "prefixado 12% a.a.",
      aplicado: "10000",
      vencimento: "2028-01-15",
      fonte: "calculado pelo ZenTrade",
      atualizadoEm: "2026-01-15 13:00 UTC",
    });
    expect(Number(titulos[0]!["bruto"])).toBeGreaterThan(10000);
    expect(titulos[1]).toMatchObject({
      origem: "pluggy",
      rendimento: "100% do CDI",
      bruto: "1080.55",
      liquido: "1066.43",
      posicaoEm: "2026-10-10",
      fonte: "informado pela instituição (Pluggy)",
    });
    expect(titulos[2]).toMatchObject({
      rendimento: "95% do CDI",
      aplicado: "500",
      indisponivel: expect.stringMatching(/CDI/),
    });
    expect(titulos[2]).not.toHaveProperty("bruto");
  });

  it("limita as linhas pelos maiores valores e avisa quantos ficaram de fora", async () => {
    const { rodar } = montar({ titulosRendaFixa: vi.fn(async () => [pluggy, titulo({})]) });
    const r = await rodar("renda_fixa", { limite: 1 });
    expect((r.dados!["titulos"] as { id: string }[]).map((t) => t.id)).toEqual(["t-1"]);
    expect(r.dados).toMatchObject({ omitidos: 1, totais: { quantidade: 2 } });
    expect((await rodar("renda_fixa", { limite: 0 })).ok).toBe(false);
  });

  it("sem títulos, diz que não há nada cadastrado", async () => {
    const { rodar, d } = montar();
    expect((await rodar("renda_fixa")).dados).toEqual({
      moeda: "BRL",
      hoje: "2026-10-11",
      titulos: [],
      aviso: expect.stringMatching(/Nenhum título/),
    });
    expect(d.indicador).not.toHaveBeenCalled();
  });
});

describe("investimentos_imobiliarios", () => {
  const aluguel: RegistroImobiliario = {
    investimento: investimento({}),
    lancamentos: [
      lancamento("2025-01-10", "aporte", "400000"),
      lancamento("2025-06-10", "receita", "2000"),
      lancamento("2025-07-10", "receita", "1000"),
    ],
  };
  const fii: RegistroImobiliario = {
    investimento: investimento({
      id: "i-2",
      tipo: "fii",
      nome: "Logística",
      ticker: "HGLG11",
      valorAtual: null,
    }),
    lancamentos: [lancamento("2026-02-02", "aporte", "1600", { quantidade: "10", investimentoId: "i-2" })],
  };
  const quebrado: RegistroImobiliario = {
    investimento: investimento({ id: "i-3", tipo: "fii", nome: "Sem cotas", ticker: "XPML11" }),
    lancamentos: [lancamento("2026-03-03", "resgate", "100", { quantidade: "5", investimentoId: "i-3" })],
  };

  it("métricas de cada investimento, os totais e a data-base, sem as anotações da pessoa", async () => {
    const { rodar, d } = montar({ imobiliario: vi.fn(async () => [aluguel, fii, quebrado]) });
    const r = await rodar("investimentos_imobiliarios");
    expect(d.imobiliario).toHaveBeenCalledWith(USUARIO_TESTE);
    expect(r.dados).toMatchObject({
      moeda: "BRL",
      dataBase: "2026-10-11",
      totais: { quantidade: 3 },
      omitidos: 0,
    });
    const [apto, logistica, semCotas] = r.dados!["investimentos"] as Record<string, unknown>[];
    expect(apto).toMatchObject({
      id: "i-1",
      nome: "Apto Centro",
      tipo: "aluguel",
      investido: "400000",
      valorAtual: "450000",
      fonteValorAtual: "manual",
      valorAtualEm: "2026-09-01",
      rendaAcumulada: "3000",
      atualizadoEm: "2026-09-01 15:30 UTC",
    });
    expect(typeof apto!["tirAnualPct"]).toBe("string");
    expect(JSON.stringify(r.dados)).not.toMatch(/anotação longa/);
    expect(logistica).toMatchObject({ ticker: "HGLG11", investido: "1600" });
    expect(logistica!["fonteValorAtual"]).not.toBe("cotacao");
    expect(semCotas).toMatchObject({ id: "i-3", erro: expect.any(String) });
    expect(semCotas).not.toHaveProperty("investido");
    expect(r.dados).toMatchObject({ avisos: [expect.stringMatching(/cotação/i)] });
  });

  it("sem investimentos, diz que não há nada cadastrado; limite inválido é recusado", async () => {
    const { rodar } = montar();
    expect((await rodar("investimentos_imobiliarios")).dados).toEqual({
      moeda: "BRL",
      dataBase: "2026-10-11",
      investimentos: [],
      aviso: expect.stringMatching(/Nenhum investimento/),
    });
    expect((await rodar("investimentos_imobiliarios", { limite: 51 })).ok).toBe(false);
  });
});

describe("falha ao ler os dados", () => {
  const quebrar = vi.fn(async () => {
    throw new Error("connect ECONNREFUSED 10.0.0.5:5432 (usuario_id=ana)");
  });

  it("vira frase curta em português nos dois provedores, sem detalhe interno", async () => {
    const { ferramenta } = montar({
      redesCarteira: quebrar,
      titulosRendaFixa: quebrar,
      imobiliario: quebrar,
    });
    for (const nome of ["carteira_cripto", "renda_fixa", "investimentos_imobiliarios"]) {
      const pelaPonte = await executarFerramenta(ferramenta(nome), {});
      expect(pelaPonte).toEqual({ ok: false, texto: mensagemDeFalha(nome) });
      const pelaApi = paraAnthropic(ferramenta(nome));
      const erro = await Promise.resolve(pelaApi.run(pelaApi.parse({}))).catch((e: unknown) => e);
      expect((erro as ToolError).content).toBe(mensagemDeFalha(nome));
      expect(`${pelaPonte.texto} ${String((erro as ToolError).content)}`).not.toMatch(
        /ECONNREFUSED|10\.0\.0\.5|usuario_id/,
      );
    }
  });
});
