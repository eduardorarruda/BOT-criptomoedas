import { describe, expect, it } from "vitest";
import { configDoAgente } from "./config.js";

const valido = {
  ANTHROPIC_API_KEY: "chave-falsa",
  AGENTE_SEGREDO: "a".repeat(32),
  DATABASE_URL: "postgres://zentrade:senha@localhost:55432/zentrade",
};

describe("configDoAgente", () => {
  it("aplica os padrões do contrato (porta 8081, claude-opus-5, timeout abaixo de 60 s)", () => {
    expect(configDoAgente(valido)).toMatchObject({
      porta: 8081,
      modelo: "claude-opus-5",
      timeoutMs: 55_000,
      nivelLog: "info",
    });
  });

  it("lista tudo o que falta, sem ecoar valores secretos", () => {
    const erro = (() => {
      try {
        configDoAgente({ AGENTE_SEGREDO: "curto-demais-segredo" });
      } catch (e) {
        return (e as Error).message;
      }
      return "";
    })();
    expect(erro).toMatch(/ANTHROPIC_API_KEY/);
    expect(erro).toMatch(/AGENTE_SEGREDO.*32/);
    expect(erro).toMatch(/DATABASE_URL/);
    expect(erro).not.toMatch(/curto-demais-segredo/);
  });

  it("valida o usuário padrão como uuid", () => {
    expect(() => configDoAgente({ ...valido, ZENTRADE_USUARIO_ID: "ana" })).toThrow(/ZENTRADE_USUARIO_ID/);
    expect(
      configDoAgente({ ...valido, ZENTRADE_USUARIO_ID: "7b0c8a52-1d2e-4c3b-9a8f-0e1d2c3b4a59" })
        .usuarioIdPadrao,
    ).toBe("7b0c8a52-1d2e-4c3b-9a8f-0e1d2c3b4a59");
  });
});
