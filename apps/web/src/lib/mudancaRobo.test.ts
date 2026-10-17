import type { RoboDTO } from "@zentrade/contratos/esquemas";
import { describe, expect, it } from "vitest";
import { desfazerDe, mudancaSegura } from "./mudancaRobo";

const robo = (extra: Partial<RoboDTO> = {}) =>
  ({ id: "r", nome: "BTC", modo: "sugerir", pausado: false, ...extra }) as RoboDTO;

describe("mudancaSegura (pode aparecer na tela antes da resposta)", () => {
  it("pausar é seguro; retomar não", () => {
    expect(mudancaSegura({ pausado: true })).toBe(true);
    expect(mudancaSegura({ pausado: false })).toBe(false);
  });

  it("ir para observar ou sugerir é seguro; ligar o automático não", () => {
    expect(mudancaSegura({ modo: "observar" })).toBe(true);
    expect(mudancaSegura({ modo: "sugerir" })).toBe(true);
    expect(mudancaSegura({ modo: "auto" })).toBe(false);
  });

  it("limites e nome esperam a resposta", () => {
    expect(mudancaSegura({ nome: "x" })).toBe(false);
    expect(mudancaSegura({ pausado: true, limites: {} as RoboDTO["limites"] })).toBe(false);
    expect(mudancaSegura({})).toBe(false);
  });
});

describe("desfazerDe", () => {
  it("pausar desfaz retomando, e retomar desfaz pausando", () => {
    expect(desfazerDe(robo(), { pausado: true })).toEqual({ pausado: false });
    expect(desfazerDe(robo({ pausado: true }), { pausado: false })).toEqual({ pausado: true });
  });

  it("trocar o modo desfaz voltando ao anterior", () => {
    expect(desfazerDe(robo({ modo: "observar" }), { modo: "sugerir" })).toEqual({ modo: "observar" });
  });

  it("nunca religa o automático: esse passa sempre pelo diálogo", () => {
    expect(desfazerDe(robo({ modo: "auto" }), { modo: "observar" })).toBeNull();
  });

  it("limites e nome não têm desfazer aqui", () => {
    expect(desfazerDe(robo(), { nome: "y" })).toBeNull();
  });
});
