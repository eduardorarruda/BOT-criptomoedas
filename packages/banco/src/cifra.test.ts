import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { cifrar, decifrar, ErroCifra, lerChaveMestra } from "./cifra.js";

const chave = randomBytes(32);
const contexto = "contas_corretora:usuario-1:api_secret";

describe("cifra em envelope (AES-256-GCM)", () => {
  it("decifra o que cifrou", () => {
    const envelope = cifrar("segredo-da-binance", chave, contexto);
    expect(decifrar(envelope, chave, contexto)).toBe("segredo-da-binance");
  });

  it("não deixa o texto em claro no envelope e muda a cada cifragem", () => {
    const a = cifrar("segredo-da-binance", chave, contexto);
    const b = cifrar("segredo-da-binance", chave, contexto);
    expect(a).not.toContain("segredo");
    expect(a).not.toBe(b);
  });

  it("recusa outra chave mestra", () => {
    const envelope = cifrar("x", chave, contexto);
    expect(() => decifrar(envelope, randomBytes(32), contexto)).toThrow(ErroCifra);
  });

  it("recusa envelope copiado para outro contexto (outra pessoa ou outro campo)", () => {
    const envelope = cifrar("x", chave, contexto);
    expect(() => decifrar(envelope, chave, "contas_corretora:usuario-2:api_secret")).toThrow(ErroCifra);
  });

  it("recusa envelope adulterado", () => {
    const partes = cifrar("abc", chave, contexto).split(".");
    const dado = Buffer.from(partes[6]!, "base64url");
    dado[0] = dado[0]! ^ 1;
    partes[6] = dado.toString("base64url");
    expect(() => decifrar(partes.join("."), chave, contexto)).toThrow(/adulterado/);
  });

  it("recusa formato desconhecido", () => {
    expect(() => decifrar("v9.a.b", chave, contexto)).toThrow(/formato/);
  });

  it("lê a chave mestra de base64 e exige 32 bytes", () => {
    expect(lerChaveMestra(chave.toString("base64")).equals(chave)).toBe(true);
    expect(() => lerChaveMestra(randomBytes(16).toString("base64"))).toThrow(/32 bytes/);
    expect(() => cifrar("x", randomBytes(8), contexto)).toThrow(/32 bytes/);
  });
});
