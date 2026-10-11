import { generate } from "otplib";
import { describe, expect, it } from "vitest";
import { hashSenha, verificarSenha } from "./senha.js";
import { gerarSegredoTotp, uriTotp, verificarCodigoTotp } from "./totp.js";
import { gerarToken, iguais, sha256 } from "./tokens.js";

describe("senha com argon2id", () => {
  it("gera hash argon2id e confere a senha certa", async () => {
    const hash = await hashSenha("correta cavalo bateria grampo");
    expect(hash.startsWith("$argon2id$")).toBe(true);
    expect(await verificarSenha(hash, "correta cavalo bateria grampo")).toBe(true);
    expect(await verificarSenha(hash, "errada")).toBe(false);
  });

  it("hash inválido não derruba: só não confere", async () => {
    expect(await verificarSenha("lixo", "x")).toBe(false);
  });
});

describe("2FA TOTP", () => {
  it("aceita o código atual e recusa outro", async () => {
    const segredo = gerarSegredoTotp();
    const codigo = await generate({ secret: segredo });
    expect(await verificarCodigoTotp(segredo, codigo)).toBe(true);
    expect(await verificarCodigoTotp(segredo, codigo === "000000" ? "111111" : "000000")).toBe(false);
    expect(await verificarCodigoTotp(segredo, "abc")).toBe(false);
  });

  it("monta a URI do app autenticador com o emissor ZenTrade", () => {
    const uri = uriTotp("JBSWY3DPEHPK3PXP", "ana@exemplo.com");
    expect(uri).toMatch(/^otpauth:\/\/totp\//);
    expect(uri).toContain("issuer=ZenTrade");
  });
});

describe("tokens aleatórios", () => {
  it("tokens longos, únicos e com prefixo", () => {
    const a = gerarToken("zt_");
    expect(a.startsWith("zt_")).toBe(true);
    expect(a.length).toBeGreaterThan(40);
    expect(gerarToken("zt_")).not.toBe(a);
  });

  it("sha256 em hex e comparação de tempo constante", () => {
    expect(sha256("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(iguais("abc", "abc")).toBe(true);
    expect(iguais("abc", "abd")).toBe(false);
    expect(iguais("abc", "abcd")).toBe(false);
  });
});

describe("chave do limite de tentativas", () => {
  it("usa o IP (IPv6 agrupado) e um balde comum quando não há IP", async () => {
    const { chaveDoCliente } = await import("../chave-cliente.js");
    expect(chaveDoCliente({ ip: "10.0.0.1" })).toBe("10.0.0.1");
    expect(chaveDoCliente({})).toBe("sem-ip");
  });
});
