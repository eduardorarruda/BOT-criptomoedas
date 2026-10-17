import type { EstadoAssistente } from "@zentrade/contratos/esquemas";
import { describe, expect, it } from "vitest";
import { precisaConectarClaude } from "./SeletorProvedor";

const ESTADO: EstadoAssistente = {
  config: { provedor: "cli", modelo: null, contaCli: null },
  agenteNoAr: true,
  provedores: { api: false, cli: true },
  provedorPadrao: "cli",
  contasCli: [],
  modelos: { api: [], cli: [] },
  tokenClaude: { usar: true, conectar: true },
  tokenClaudeFinal: null,
};

describe("aviso para conectar o Claude no chat", () => {
  it("aparece com o Claude Code escolhido e o token da pessoa ainda não conectado", () => {
    expect(precisaConectarClaude(ESTADO)).toBe(true);
  });

  it("some quando a pessoa já conectou o Claude dela", () => {
    expect(precisaConectarClaude({ ...ESTADO, tokenClaudeFinal: "9z9z" })).toBe(false);
  });

  it("não aparece com a API escolhida, sem agente, ou se o servidor não usa token por pessoa", () => {
    expect(precisaConectarClaude({ ...ESTADO, config: { ...ESTADO.config, provedor: "api" } })).toBe(false);
    expect(precisaConectarClaude({ ...ESTADO, agenteNoAr: false })).toBe(false);
    expect(precisaConectarClaude({ ...ESTADO, tokenClaude: { usar: false, conectar: false } })).toBe(false);
    expect(precisaConectarClaude({ ...ESTADO, tokenClaude: undefined })).toBe(false);
    expect(precisaConectarClaude(undefined)).toBe(false);
  });
});
