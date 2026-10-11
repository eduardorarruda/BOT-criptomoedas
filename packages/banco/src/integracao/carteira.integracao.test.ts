import { randomBytes } from "node:crypto";
import { dec } from "@zentrade/dominio";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarBanco, criarBancoDoMotor } from "../banco.js";
import { comoUsuario } from "../cliente.js";
import { carteiraNegociacoes, carteiraSaldos } from "../esquema/index.js";
import type { NegociacaoCarteiraGravada } from "../repositorios/carteira.js";
import { montarCenario, type Cenario } from "./ajuda.js";

const negociacao = (
  id: number,
  extra: Partial<NegociacaoCarteiraGravada> = {},
): NegociacaoCarteiraGravada => ({
  simbolo: "BTCUSDT",
  base: "BTC",
  cotacao: "USDT",
  idNegociacao: id,
  idOrdem: 1000 + id,
  idCliente: id % 2 === 0 ? "zt-abc" : "web_1",
  origem: id % 2 === 0 ? "robo" : "manual",
  lado: "COMPRA",
  preco: dec("50000.123456789"),
  quantidade: dec("0.00012345"),
  valorCotacao: dec("6.17252"),
  taxa: dec("0.00000012"),
  ativoTaxa: "BNB",
  cotacaoUsdt: dec(1),
  taxaUsdt: null,
  em: 1_760_000_000_000 + id,
  ...extra,
});

describe("carteira no banco", () => {
  let c: Cenario;
  beforeAll(async () => {
    c = await montarCenario();
  });
  afterAll(async () => c.encerrar());

  it("importar de novo não duplica: idempotente por pessoa, rede, par e id", async () => {
    const { carteira } = c.banco;
    expect(await carteira.gravarNegociacoes(c.ana.id, "testnet", [negociacao(1), negociacao(2)])).toBe(2);
    expect(
      await carteira.gravarNegociacoes(c.ana.id, "testnet", [negociacao(1), negociacao(2), negociacao(3)]),
    ).toBe(1);
    // Mesma negociação em outra rede é outra negociação.
    expect(await carteira.gravarNegociacoes(c.ana.id, "real", [negociacao(1)])).toBe(1);
    const lidas = await carteira.negociacoes(c.ana.id, "testnet");
    expect(lidas.map((n) => [n.id, n.origem, n.idOrdem])).toEqual([
      ["BTCUSDT:1", "manual", "1001"],
      ["BTCUSDT:2", "robo", "1002"],
      ["BTCUSDT:3", "manual", "1003"],
    ]);
    expect([lidas[0]!.preco.toFixed(), lidas[0]!.quantidade.toFixed(), lidas[0]!.taxaUsdt]).toEqual([
      "50000.123456789",
      "0.00012345",
      null,
    ]);
    expect((await carteira.ultimosIds(c.ana.id, "testnet")).get("BTCUSDT")).toBe(3);
  });

  it("muitas negociações entram em lotes", async () => {
    const muitas = Array.from({ length: 1203 }, (_, i) =>
      negociacao(10_000 + i, { simbolo: "ETHUSDT", base: "ETH" }),
    );
    expect(await c.banco.carteira.gravarNegociacoes(c.ana.id, "testnet", muitas)).toBe(1203);
    expect((await c.banco.carteira.ultimosIds(c.ana.id, "testnet")).get("ETHUSDT")).toBe(11_202);
  });

  it("filtra as negociações que tocam uma moeda: base, cotação ou taxa", async () => {
    const { carteira } = c.banco;
    await carteira.gravarNegociacoes(c.ana.id, "testnet", [
      negociacao(50, { simbolo: "ETHBTC", base: "ETH", cotacao: "BTC", ativoTaxa: "ETH" }),
    ]);
    const bnb = await carteira.negociacoes(c.ana.id, "testnet", "BNB");
    expect(bnb.length).toBeGreaterThan(1000);
    const btc = await carteira.negociacoes(c.ana.id, "testnet", "BTC");
    expect(btc.map((n) => n.simbolo)).toContain("ETHBTC");
    expect(btc.every((n) => n.base === "BTC" || n.cotacao === "BTC" || n.ativoTaxa === "BTC")).toBe(true);
  });

  it("saldos: a foto é trocada inteira a cada sincronização", async () => {
    const { carteira } = c.banco;
    await carteira.gravarSaldos(
      c.ana.id,
      "testnet",
      [{ ativo: "BTC", livre: dec("0.5"), bloqueado: dec("0.1") }],
      1,
    );
    await carteira.gravarSaldos(
      c.ana.id,
      "testnet",
      [
        { ativo: "ETH", livre: dec("2"), bloqueado: dec(0) },
        { ativo: "USDT", livre: dec("10.5"), bloqueado: dec(0) },
      ],
      2,
    );
    const saldos = await carteira.saldos(c.ana.id, "testnet");
    expect(saldos.map((s) => [s.ativo, s.livre.toFixed()])).toEqual([
      ["ETH", "2"],
      ["USDT", "10.5"],
    ]);
    await carteira.gravarSaldos(c.ana.id, "testnet", [], 3);
    expect(await carteira.saldos(c.ana.id, "testnet")).toEqual([]);
  });

  it("estado da sincronização: os pares conhecidos se acumulam", async () => {
    const { carteira } = c.banco;
    expect(await carteira.sincronizacao(c.ana.id, "testnet")).toBeNull();
    await carteira.registrarSincronizacao(c.ana.id, "testnet", {
      em: 1_000,
      ok: true,
      erro: null,
      negociacoes: 3,
      simbolos: ["BTCUSDT"],
    });
    await carteira.registrarSincronizacao(c.ana.id, "testnet", {
      em: 2_000,
      ok: false,
      erro: "limite da Binance",
      negociacoes: 0,
      simbolos: ["ETHUSDT", "BTCUSDT"],
    });
    expect(await carteira.sincronizacao(c.ana.id, "testnet")).toEqual({
      em: 2_000,
      ok: false,
      erro: "limite da Binance",
      negociacoes: 0,
      simbolos: ["BTCUSDT", "ETHUSDT"],
    });
  });

  it("RLS: uma pessoa não vê nem grava a carteira da outra", async () => {
    const { carteira, conexao } = c.banco;
    await carteira.gravarSaldos(
      c.beto.id,
      "testnet",
      [{ ativo: "SOL", livre: dec(1), bloqueado: dec(0) }],
      1,
    );
    expect(await carteira.negociacoes(c.beto.id, "testnet")).toEqual([]);
    expect((await carteira.saldos(c.ana.id, "testnet")).map((s) => s.ativo)).not.toContain("SOL");
    const cruas = await comoUsuario(conexao.db, c.beto.id, (tx) => tx.select().from(carteiraNegociacoes));
    expect(cruas).toEqual([]);
    await expect(
      comoUsuario(conexao.db, c.beto.id, (tx) =>
        tx
          .insert(carteiraSaldos)
          .values({ usuarioId: c.ana.id, rede: "testnet", ativo: "X", livre: "1", bloqueado: "0" }),
      ),
    ).rejects.toThrow();
    await comoUsuario(conexao.db, c.beto.id, (tx) => tx.execute(sql`delete from carteira_negociacoes`));
    expect((await carteira.negociacoes(c.ana.id, "testnet")).length).toBeGreaterThan(0);
  });

  it("recusa quantidade não positiva e rede desconhecida", async () => {
    await expect(
      c.banco.carteira.gravarNegociacoes(c.ana.id, "testnet", [negociacao(99, { quantidade: dec(0) })]),
    ).rejects.toThrow();
    await expect(
      c.banco.carteira.gravarNegociacoes(c.ana.id, "papel" as "testnet", [negociacao(98)]),
    ).rejects.toThrow();
  });

  it("credenciais: a porta decifra a chave da pessoa na rede pedida; o motor só tem com a chave mestra", async () => {
    await c.banco.contas.criar(c.ana.id, {
      corretora: "binance",
      rede: "testnet",
      apiKey: "chave-da-ana-123456",
      apiSecret: "segredo-da-ana-123456",
    });
    expect(await c.banco.credenciais.binance(c.ana.id, "testnet")).toEqual({
      apiKey: "chave-da-ana-123456",
      apiSecret: "segredo-da-ana-123456",
    });
    expect(await c.banco.credenciais.binance(c.ana.id, "real")).toBeNull();
    expect(await c.banco.credenciais.binance(c.beto.id, "testnet")).toBeNull();
    expect(await c.banco.carteira.contasParaSincronizar()).toEqual([
      { usuarioId: c.ana.id, rede: "testnet" },
    ]);

    const semChave = criarBancoDoMotor({ url: c.url, maximoConexoes: 1 });
    expect(semChave.credenciais).toBeNull();
    await semChave.fechar();
    const outraChave = criarBancoDoMotor({ url: c.url, maximoConexoes: 1, chaveMestra: randomBytes(32) });
    await expect(outraChave.credenciais!.binance(c.ana.id, "testnet")).rejects.toThrow(/chave mestra/);
    await outraChave.fechar();
  });

  it("apagar a pessoa apaga a carteira dela", async () => {
    const banco = criarBanco({ url: c.url, chaveMestra: randomBytes(32), maximoConexoes: 1 });
    const u = await banco.usuarios.criar({ email: "carla@exemplo.com", nome: "Carla", senhaHash: "x" });
    await banco.carteira.gravarNegociacoes(u.id, "real", [negociacao(1)]);
    await banco.conexao.sql`delete from usuarios where id = ${u.id}`;
    const [linha] = await banco.conexao.sql<
      { n: number }[]
    >`select count(*)::int as n from carteira_negociacoes where usuario_id = ${u.id}`;
    expect(linha?.n).toBe(0);
    await banco.fechar();
  });
});
