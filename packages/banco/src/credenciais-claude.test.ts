import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ErroCifra } from "./cifra.js";
import { cifrarTokenClaude, decifrarTokenClaude } from "./repositorios/credenciais-claude.js";

const chave = randomBytes(32);
const TOKEN = `sk-ant-oat01-${"x".repeat(90)}`;
const ANA = "7b0c8a52-1d2e-4c3b-9a8f-0e1d2c3b4a59";
const BETO = "0f3e2d1c-4b5a-4968-8776-655443322110";

describe("token do Claude Code cifrado", () => {
  it("decifra o que cifrou, sem o token em claro no envelope", () => {
    const envelope = cifrarTokenClaude(TOKEN, chave, ANA);
    expect(envelope).not.toContain("sk-ant");
    expect(envelope).not.toContain("xxxx");
    expect(decifrarTokenClaude(envelope, chave, ANA)).toBe(TOKEN);
  });

  it("envelope copiado para a linha de outra pessoa não abre", () => {
    const envelope = cifrarTokenClaude(TOKEN, chave, ANA);
    expect(() => decifrarTokenClaude(envelope, chave, BETO)).toThrow(ErroCifra);
  });

  it("outra chave mestra não abre", () => {
    const envelope = cifrarTokenClaude(TOKEN, chave, ANA);
    expect(() => decifrarTokenClaude(envelope, randomBytes(32), ANA)).toThrow(ErroCifra);
  });
});
