import { describe, expect, it } from "vitest";
import { lerConfig } from "./config.js";

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

  it("variável vazia (como no .env.example) conta como ausente", () => {
    expect(
      lerConfig({ BINANCE_API_KEY: "", MOTOR_AGENTE_OBRIGATORIO: "false" }).BINANCE_API_KEY,
    ).toBeUndefined();
    expect(lerConfig({ MOTOR_AGENTE_OBRIGATORIO: "false" }).MOTOR_AGENTE_OBRIGATORIO).toBe(false);
  });

  it("testnet exige as chaves; agente HTTP exige segredo de 32+ caracteres", () => {
    expect(() => lerConfig({ MOTOR_REDE: "testnet" })).toThrow(/BINANCE_API_KEY/);
    expect(
      lerConfig({ MOTOR_REDE: "testnet", BINANCE_API_KEY: "k", BINANCE_API_SECRET: "s" }).MOTOR_REDE,
    ).toBe("testnet");
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
});
