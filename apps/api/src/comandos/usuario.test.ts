import { describe, expect, it } from "vitest";
import { lerArgumentos, NovoUsuarioEsquema } from "./usuario.js";

describe("comando criar-usuario", () => {
  it("lê --chave valor e ignora sobra", () => {
    expect(lerArgumentos(["--email", "ana@exemplo.com", "--nome", "Ana", "--solto"])).toEqual({
      email: "ana@exemplo.com",
      nome: "Ana",
    });
    expect(lerArgumentos(["--email", "--nome", "Ana"])).toEqual({ nome: "Ana" });
  });

  it("exige senha longa", () => {
    expect(NovoUsuarioEsquema.safeParse({ email: "a@b.co", nome: "A", senha: "curta" }).success).toBe(false);
  });
});
