import { describe, expect, it } from "vitest";
import { ConfigPublicaEsquema } from "./esquemas.js";

describe("config pública", () => {
  it("aceita controlador configurado e encarregado nulo", () => {
    const config = {
      controlador: { nome: "Ana Exemplo", email: "privacidade@exemplo.com" },
      encarregado: null,
      versao: "0.1.0",
    };
    expect(ConfigPublicaEsquema.parse(config)).toEqual(config);
  });

  it("aceita instância sem controlador configurado", () => {
    expect(
      ConfigPublicaEsquema.safeParse({ controlador: null, encarregado: null, versao: "0.1.0" }).success,
    ).toBe(true);
  });

  it("recusa e-mail inválido e campo faltando", () => {
    expect(
      ConfigPublicaEsquema.safeParse({
        controlador: { nome: "Ana", email: "ana" },
        encarregado: null,
        versao: "1",
      }).success,
    ).toBe(false);
    expect(ConfigPublicaEsquema.safeParse({ controlador: null, versao: "1" }).success).toBe(false);
  });
});
