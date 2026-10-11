import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { lerConfigBanco } from "./config.js";

describe("configuração do banco", () => {
  const chave = randomBytes(32).toString("base64");

  it("lê a URL e a chave mestra", () => {
    const c = lerConfigBanco({ DATABASE_URL: "postgres://u:s@h:1/b", ZENTRADE_CHAVE_MESTRA: chave });
    expect(c.ZENTRADE_CHAVE_MESTRA.length).toBe(32);
  });

  it("explica o que falta, sem ecoar valores", () => {
    expect(() => lerConfigBanco({})).toThrow(/defina DATABASE_URL/);
    expect(() => lerConfigBanco({ DATABASE_URL: "mysql://x", ZENTRADE_CHAVE_MESTRA: chave })).toThrow(
      /postgres:\/\//,
    );
    expect(() => lerConfigBanco({ DATABASE_URL: "postgres://x", ZENTRADE_CHAVE_MESTRA: "curta" })).toThrow(
      /32 bytes/,
    );
  });
});
