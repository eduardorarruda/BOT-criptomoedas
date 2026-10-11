import { Disjuntor } from "@zentrade/corretora";
import type { ContaCorretora } from "@zentrade/banco";
import { ContaBinance, ErroConfiguracao, ErroLimiteRequisicoes, ErroRede } from "@zentrade/corretora";
import { describe, expect, it, vi } from "vitest";
import { ErroApi } from "../erros.js";
import { estadoInicial, fetchDaBinanceFalsa, type EstadoBinanceFalsa } from "../integracao/binance-falsa.js";
import { carteiraEmMemoria } from "../integracao/carteira-memoria.js";
import { contaNaoEncontrada, erroDaBinance, fabricaContaBinance } from "./binance-conta.js";
import { criarServicoCarteira, servicoCarteiraDe, type DependenciasCarteira } from "./binance-carteira.js";
import { simbolosCandidatos } from "./binance-sincronizacao.js";
import { avisosDaChave } from "./binance-status.js";

const AGORA = Date.UTC(2026, 9, 11, 12, 0);
const ANA = "11111111-1111-4111-8111-111111111111";

const conta = (rede: ContaCorretora["rede"]): ContaCorretora => ({
  id: `c-${rede}`,
  corretora: "binance",
  rede,
  apiKeyFinal: "…abcd",
  criadaEm: 1,
});

function montar(redes: ContaCorretora["rede"][] = ["testnet"]) {
  const binance: EstadoBinanceFalsa = estadoInicial(AGORA);
  binance.saldos = [
    { asset: "BTC", free: "0.01", locked: "0" },
    { asset: "USDT", free: "50", locked: "0" },
  ];
  binance.negociacoes = {
    BTCUSDT: [
      {
        id: 1,
        orderId: 9,
        price: "50000",
        qty: "0.01",
        commission: "0.5",
        commissionAsset: "USDT",
        time: AGORA,
        isBuyer: true,
      },
    ],
  };
  binance.ordens = { 9: "zt-robo" };
  binance.precos = { BTCUSDT: "60000" };
  const carteira = carteiraEmMemoria(redes.map((rede) => ({ usuarioId: ANA, rede })));
  const credenciais = { binance: vi.fn(async () => ({ apiKey: "k", apiSecret: "s" })) };
  const banco = {
    contas: { listar: async () => redes.map(conta) },
    credenciais,
    carteira,
    robos: { listar: async () => [{ rede: "testnet", simbolo: "ETHBTC" }] },
  } as unknown as DependenciasCarteira["banco"];
  const relogio = { t: AGORA };
  const log = { warn: vi.fn() };
  const servico = criarServicoCarteira({
    banco,
    criarConta: fabricaContaBinance({
      // Cada teste com o próprio disjuntor: um 429 simulado não bloqueia os seguintes.
      disjuntorDe: () => new Disjuntor(),
      fetch: fetchDaBinanceFalsa(binance),
      agora: () => AGORA,
      dormir: async () => undefined,
    }),
    agora: () => relogio.t,
    log,
  });
  return { servico, binance, credenciais, relogio, log, carteira };
}

describe("serviço da carteira", () => {
  it("sem conta: desconectada; sincronizar sem conta explica", async () => {
    const { servico } = montar([]);
    expect(await servico.carteira(ANA)).toMatchObject({ conectada: false, rede: null });
    await expect(servico.sincronizar(ANA, {})).rejects.toMatchObject({ codigo: "conta_nao_encontrada" });
    await expect(servico.ativo(ANA, "BTC")).rejects.toMatchObject({ codigo: "conta_nao_encontrada" });
  });

  it("sincroniza, calcula e detalha; robô pelo clientOrderId e par do robô incluído", async () => {
    const { servico, binance } = montar();
    const s = await servico.sincronizar(ANA, {});
    expect(s).toMatchObject({ negociacoesNovas: 1, parcial: false });
    expect(s.simbolos).toEqual(["BTCUSDT", "ETHBTC"]);
    const c = await servico.carteira(ANA);
    const btc = c.moedas.find((m) => m.ativo === "BTC")!;
    expect(btc.robo).toMatchObject({ quantidade: "0.01", resultadoNaoRealizado: "100", taxas: "0.5" });
    expect(c.resumo.total.resultadoLiquido).toBe("99.5");
    const d = await servico.ativo(ANA, "BTC");
    expect(d.negociacoes).toHaveLength(1);
    await expect(servico.ativo(ANA, "DOGE")).rejects.toMatchObject({ codigo: "nao_encontrado" });
    // Preços em cache curto: a segunda leitura não pede de novo.
    const antes = binance.chamadas.filter((c) => c === "/api/v3/ticker/price").length;
    await servico.carteira(ANA);
    expect(binance.chamadas.filter((c) => c === "/api/v3/ticker/price").length).toBe(antes);
  });

  it("preços indisponíveis: a carteira sai com valores desconhecidos e o motivo", async () => {
    const { servico, credenciais } = montar();
    await servico.sincronizar(ANA, {});
    credenciais.binance.mockRejectedValueOnce(Object.assign(new Error("x"), { name: "ErroCifra" }));
    const c = await servico.carteira(ANA);
    expect(c.precosEm).toBeNull();
    expect(c.avisos.join(" ")).toMatch(/Preços atuais indisponíveis.*chave mestra/);
    expect(c.moedas.find((m) => m.ativo === "BTC")!.total.valorAtual).toBeNull();
  });

  it("duas sincronizações da mesma conta ao mesmo tempo: a segunda espera a vez (409)", async () => {
    const { servico } = montar();
    const primeira = servico.sincronizar(ANA, {});
    await expect(servico.sincronizar(ANA, {})).rejects.toMatchObject({
      codigo: "sincronizacao_em_andamento",
    });
    await primeira;
    await expect(servico.sincronizar(ANA, {})).resolves.toMatchObject({ negociacoesNovas: 0 });
  });

  it("chave sumiu entre listar e sincronizar: conta não encontrada", async () => {
    const { servico, credenciais } = montar();
    credenciais.binance.mockResolvedValueOnce(null as never);
    await expect(servico.sincronizar(ANA, {})).rejects.toMatchObject({ codigo: "conta_nao_encontrada" });
  });

  it("sincronização periódica: falha de uma conta vai para o registro e não para as outras", async () => {
    const { servico, binance, log, carteira } = montar(["testnet", "real"]);
    binance.chaveInvalida = true;
    await servico.sincronizarTodos();
    expect(log.warn).toHaveBeenCalledTimes(2);
    expect(await carteira.sincronizacao(ANA, "real")).toMatchObject({ ok: false });
  });

  it("status: uma linha por conta", async () => {
    const { servico } = montar(["testnet", "real"]);
    const s = await servico.status(ANA);
    expect(s.contas.map((c) => [c.rede, c.conectada, c.permissoesLidas])).toEqual([
      ["testnet", true, false],
      ["real", true, true],
    ]);
  });

  it("um serviço por API: injetado nos testes, padrão e reaproveitado nas demais", () => {
    const { servico } = montar();
    const deps = { banco: {} as DependenciasCarteira["banco"], agora: Date.now };
    expect(servicoCarteiraDe({ ...deps, carteira: servico })).toBe(servico);
    const padrao = servicoCarteiraDe(deps, { warn: () => undefined });
    expect(servicoCarteiraDe(deps)).toBe(padrao);
  });
});

describe("erros da Binance para a API", () => {
  it("cada erro com o status e o código certos", () => {
    expect(erroDaBinance(new ErroLimiteRequisicoes("x", 1, false))).toMatchObject({
      statusCode: 429,
      codigo: "binance_limite",
    });
    expect(erroDaBinance(new ErroRede("x"))).toMatchObject({
      statusCode: 502,
      codigo: "binance_indisponivel",
    });
    expect(erroDaBinance(new ErroConfiguracao("x"))).toMatchObject({
      statusCode: 502,
      codigo: "binance_recusou",
    });
    expect(erroDaBinance(new Error("?"))).toMatchObject({ codigo: "binance_indisponivel" });
    const api = new ErroApi(418, "x", "y");
    expect(erroDaBinance(api)).toBe(api);
    expect(contaNaoEncontrada("real").message).toMatch(/só de leitura basta/);
  });

  it("a fábrica cria uma ContaBinance da rede pedida", () => {
    expect(fabricaContaBinance()("real", { apiKey: "k", apiSecret: "s" })).toBeInstanceOf(ContaBinance);
  });
});

describe("pares candidatos e avisos da chave", () => {
  const pares = new Map([
    ["BTCUSDT", { base: "BTC", cotacao: "USDT" }],
    ["BTCBRL", { base: "BTC", cotacao: "BRL" }],
    ["ETHBTC", { base: "ETH", cotacao: "BTC" }],
  ]);

  it("moedas do saldo × cotações comuns, mais conhecidos, robôs e extras; só os que existem", () => {
    const r = simbolosCandidatos({
      ativos: ["BTC"],
      conhecidos: ["ETHBTC"],
      robos: ["BTCUSDT"],
      extras: ["XYZUSDT"],
      pares,
    });
    expect(r.simbolos).toEqual(["BTCBRL", "BTCUSDT", "ETHBTC"]);
    expect(r.avisos.join(" ")).toMatch(/XYZUSDT não existe/);
  });

  it("avisos: saque, IP livre, só leitura; testnet e falha de leitura", () => {
    const tudoAberto = { podeLer: true, podeSacar: true, podeNegociar: false, ipRestrito: false };
    expect(avisosDaChave("real", tudoAberto).join(" ")).toMatch(/SAQUE[\s\S]*IP[\s\S]*só de leitura/);
    expect(
      avisosDaChave("real", { ...tudoAberto, podeSacar: false, ipRestrito: true, podeNegociar: true }),
    ).toEqual([]);
    expect(avisosDaChave("testnet", null).join(" ")).toMatch(/testnet não informa/);
    expect(avisosDaChave("real", null).join(" ")).toMatch(/Não foi possível ler/);
  });
});
