import type { RoboDTO } from "@zentrade/contratos/esquemas";
import { describe, expect, it } from "vitest";
import { desfazerDe, mudancaSegura } from "./mudancaRobo";

const robo = (extra: Partial<RoboDTO> = {}) =>
  ({ id: "r", nome: "BTC", modo: "sugerir", pausado: false, rede: "testnet", ...extra }) as RoboDTO;

describe("mudancaSegura (pode aparecer na tela antes da resposta)", () => {
  it("pausar é seguro; retomar não", () => {
    expect(mudancaSegura(robo(), { pausado: true })).toBe(true);
    expect(mudancaSegura(robo({ pausado: true }), { pausado: false })).toBe(false);
  });

  it("só baixar o modo é seguro: auto → sugerir → observar", () => {
    expect(mudancaSegura(robo({ modo: "auto" }), { modo: "sugerir" })).toBe(true);
    expect(mudancaSegura(robo({ modo: "sugerir" }), { modo: "observar" })).toBe(true);
  });

  it("subir o modo espera a resposta (na rede real, sugerir já manda ordem de verdade)", () => {
    expect(mudancaSegura(robo({ modo: "observar", rede: "real" }), { modo: "sugerir" })).toBe(false);
    expect(mudancaSegura(robo({ modo: "observar" }), { modo: "sugerir" })).toBe(false);
    expect(mudancaSegura(robo({ modo: "sugerir" }), { modo: "auto" })).toBe(false);
  });

  it("limites e nome esperam a resposta", () => {
    expect(mudancaSegura(robo(), { nome: "x" })).toBe(false);
    expect(mudancaSegura(robo(), { pausado: true, limites: {} as RoboDTO["limites"] })).toBe(false);
    expect(mudancaSegura(robo(), {})).toBe(false);
  });
});

describe("desfazerDe (o Desfazer nunca deixa o robô mais ativo do que um clique pensado)", () => {
  it("pausar desfaz retomando, se o robô não opera sozinho", () => {
    expect(desfazerDe(robo({ modo: "sugerir" }), { pausado: true })).toEqual({ pausado: false });
    expect(desfazerDe(robo({ modo: "observar" }), { pausado: true })).toEqual({ pausado: false });
  });

  it("pausar um robô no automático não tem Desfazer: retomar é pelo botão", () => {
    expect(desfazerDe(robo({ modo: "auto" }), { pausado: true })).toBeNull();
  });

  it("retomar desfaz pausando", () => {
    expect(desfazerDe(robo({ pausado: true }), { pausado: false })).toEqual({ pausado: true });
  });

  it("subir o modo desfaz voltando ao mais calmo", () => {
    expect(desfazerDe(robo({ modo: "observar" }), { modo: "sugerir" })).toEqual({ modo: "observar" });
  });

  it("baixar o modo não tem Desfazer (voltaria a um modo mais ativo)", () => {
    expect(desfazerDe(robo({ modo: "sugerir" }), { modo: "observar" })).toBeNull();
    expect(desfazerDe(robo({ modo: "auto" }), { modo: "observar" })).toBeNull();
  });

  it("limites e nome não têm desfazer aqui", () => {
    expect(desfazerDe(robo(), { nome: "y" })).toBeNull();
  });
});
