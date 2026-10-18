import { describe, expect, it } from "vitest";
import { lerConfig } from "./config.js";

const BANCO = "postgres://zentrade:x@127.0.0.1:55432/zentrade";
const TESTNET = { MOTOR_REDE: "testnet", DATABASE_URL: BANCO };
const CHAVE_MESTRA = Buffer.alloc(32, 7).toString("base64");
const DEV = { ZENTRADE_AMBIENTE: "desenvolvimento" };

describe("configuração do motor (variáveis de ambiente)", () => {
  it("padrões seguros: papel, agente obrigatório, agente fixo que nunca concorda", () => {
    const c = lerConfig({});
    expect(c).toMatchObject({
      MOTOR_REDE: "papel",
      MOTOR_PAPEL_DADOS: "testnet",
      MOTOR_AGENTE_OBRIGATORIO: true,
      MOTOR_AGENTE_FIXO: "nunca_concorda",
      MOTOR_PAPEL_SALDO: "1000",
      LOG_LEVEL: "info",
    });
    expect(c.AGENTE_URL).toBeUndefined();
  });

  it("fuso da instância: Brasília por padrão; nome IANA aceito; inválido derruba a partida explicando", () => {
    expect(lerConfig({}).ZENTRADE_FUSO).toBe("America/Sao_Paulo");
    expect(lerConfig({ ZENTRADE_FUSO: "America/New_York" }).ZENTRADE_FUSO).toBe("America/New_York");
    expect(() => lerConfig({ ZENTRADE_FUSO: "Brasilia" })).toThrow(/ZENTRADE_FUSO: fuso desconhecido/);
  });

  it("stop na corretora ligado por padrão, com o limite 1% abaixo do gatilho; dá para desligar e ajustar", () => {
    const padrao = lerConfig({});
    expect(padrao.MOTOR_STOP_NA_CORRETORA).toBe(true);
    expect(padrao.MOTOR_STOP_LIMITE_BPS).toBe(100);
    const ajustada = lerConfig({ MOTOR_STOP_NA_CORRETORA: "false", MOTOR_STOP_LIMITE_BPS: "50" });
    expect(ajustada.MOTOR_STOP_NA_CORRETORA).toBe(false);
    expect(ajustada.MOTOR_STOP_LIMITE_BPS).toBe(50);
    expect(() => lerConfig({ MOTOR_STOP_LIMITE_BPS: "0" })).toThrow(/MOTOR_STOP_LIMITE_BPS/);
  });

  it("variável vazia (como no .env.example) conta como ausente", () => {
    expect(
      lerConfig({ BINANCE_API_KEY: "", MOTOR_AGENTE_OBRIGATORIO: "false" }).BINANCE_API_KEY,
    ).toBeUndefined();
    expect(lerConfig({ MOTOR_AGENTE_OBRIGATORIO: "false" }).MOTOR_AGENTE_OBRIGATORIO).toBe(false);
  });

  it("testnet usa a chave de cada pessoa: exige a chave mestra para decifrá-la", () => {
    expect(() => lerConfig(TESTNET)).toThrow(/ZENTRADE_CHAVE_MESTRA/);
    const c = lerConfig({ ...TESTNET, ZENTRADE_CHAVE_MESTRA: CHAVE_MESTRA });
    expect(c.MOTOR_REDE).toBe("testnet");
    expect(c.ZENTRADE_CHAVE_MESTRA?.length).toBe(32);
    expect(c.ZENTRADE_AMBIENTE).toBe("producao");
    expect(() => lerConfig({ ...TESTNET, ZENTRADE_CHAVE_MESTRA: "curta" })).toThrow(/32 bytes/);
  });

  it("chaves do ambiente só em desenvolvimento (e aí dispensam a chave mestra)", () => {
    const comChaves = { ...TESTNET, BINANCE_API_KEY: "k", BINANCE_API_SECRET: "s" };
    expect(() => lerConfig({ ...comChaves, ZENTRADE_CHAVE_MESTRA: CHAVE_MESTRA })).toThrow(
      /só valem com ZENTRADE_AMBIENTE=desenvolvimento/,
    );
    expect(lerConfig({ ...comChaves, ...DEV }).BINANCE_API_KEY).toBe("k");
    expect(() => lerConfig({ ...TESTNET, ...DEV, BINANCE_API_KEY: "k" })).toThrow(/ZENTRADE_CHAVE_MESTRA/);
    expect(() => lerConfig({ ZENTRADE_AMBIENTE: "teste" })).toThrow(/ZENTRADE_AMBIENTE/);
  });

  it("agente HTTP exige segredo de 32+ caracteres", () => {
    expect(() => lerConfig({ AGENTE_URL: "http://agente:8081" })).toThrow(/AGENTE_SEGREDO/);
    expect(() => lerConfig({ AGENTE_URL: "http://agente:8081", AGENTE_SEGREDO: "curto" })).toThrow(
      /AGENTE_SEGREDO/,
    );
  });

  it("dinheiro real não liga por aqui; valores tortos são recusados com o nome da variável", () => {
    expect(() => lerConfig({ MOTOR_REDE: "real" })).toThrow(/MOTOR_REDE/);
    expect(() => lerConfig({ MOTOR_PAPEL_TAXA: "abc" })).toThrow(/MOTOR_PAPEL_TAXA/);
    expect(() => lerConfig({ MOTOR_PAPEL_SALDO: "1e3" })).toThrow(/MOTOR_PAPEL_SALDO/);
  });

  it("testnet sem banco não sobe: estado durável é obrigatório fora do papel", () => {
    expect(() => lerConfig({ MOTOR_REDE: "testnet", ZENTRADE_CHAVE_MESTRA: CHAVE_MESTRA })).toThrow(
      /DATABASE_URL: a testnet exige banco/,
    );
    expect(lerConfig({}).DATABASE_URL).toBeUndefined();
  });

  it("banco, Redis, prazo de aprovação, recarga e backtest", () => {
    const c = lerConfig({
      DATABASE_URL: BANCO,
      REDIS_URL: "redis://:senha@127.0.0.1:56379",
      APROVACAO_VALIDADE_MIN: "7",
      MOTOR_RECARGA_SEGUNDOS: "10",
      MOTOR_BACKTEST_SALDO: "500",
      MOTOR_BACKTEST_RISCO: "0.02",
    });
    expect(c).toMatchObject({
      DATABASE_URL: BANCO,
      REDIS_URL: "redis://:senha@127.0.0.1:56379",
      APROVACAO_VALIDADE_MIN: 7,
      MOTOR_RECARGA_SEGUNDOS: 10,
      MOTOR_BACKTEST_SALDO: "500",
      MOTOR_BACKTEST_RISCO: 0.02,
    });
    expect(lerConfig({})).toMatchObject({
      APROVACAO_VALIDADE_MIN: 5,
      MOTOR_RECARGA_SEGUNDOS: 30,
      MOTOR_BACKTEST_SALDO: "1000",
      MOTOR_BACKTEST_RISCO: 0.01,
    });
    expect(() => lerConfig({ DATABASE_URL: "mysql://x" })).toThrow(/DATABASE_URL/);
    expect(() => lerConfig({ REDIS_URL: "http://x" })).toThrow(/REDIS_URL/);
    expect(() => lerConfig({ MOTOR_BACKTEST_RISCO: "0.9" })).toThrow(/MOTOR_BACKTEST_RISCO/);
  });

  it("placar do Claude: ligado, a cada 5 min, 500 candles de horizonte e 7 pontos-base; tudo ajustável", () => {
    expect(lerConfig({})).toMatchObject({
      MOTOR_PLACAR: true,
      MOTOR_PLACAR_MINUTOS: 5,
      MOTOR_PLACAR_HORIZONTE: 500,
      MOTOR_PLACAR_BPS: 7,
      MOTOR_PLACAR_DIAS: 30,
      MOTOR_PLACAR_LOTE: 50,
    });
    expect(lerConfig({ MOTOR_PLACAR: "false", MOTOR_PLACAR_HORIZONTE: "100" })).toMatchObject({
      MOTOR_PLACAR: false,
      MOTOR_PLACAR_HORIZONTE: 100,
    });
    expect(() => lerConfig({ MOTOR_PLACAR_HORIZONTE: "5000" })).toThrow(/MOTOR_PLACAR_HORIZONTE/);
  });
});
