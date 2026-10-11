import { describe, expect, it } from "vitest";
import { codigoPostgres, ErroDados } from "./erros.js";

describe("erros do banco", () => {
  it("acha o SQLSTATE mesmo embrulhado pelo Drizzle", () => {
    const original = Object.assign(new Error("duplicate key"), { code: "23505" });
    const embrulhado = new Error("Failed query", { cause: original });
    expect(codigoPostgres(embrulhado)).toBe("23505");
  });

  it("ignora erros que não vêm do PostgreSQL", () => {
    expect(codigoPostgres(new Error("rede caiu"))).toBeUndefined();
    expect(codigoPostgres(Object.assign(new Error("x"), { code: "ECONNREFUSED" }))).toBeUndefined();
    expect(codigoPostgres(null)).toBeUndefined();
  });

  it("carrega o código para a API", () => {
    const e = new ErroDados("conflito", "já existe");
    expect(e.codigo).toBe("conflito");
    expect(e.message).toBe("já existe");
  });
});
