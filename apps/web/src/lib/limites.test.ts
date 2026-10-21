import { describe, expect, it } from "vitest";
import { deLimites, validarLimites } from "./limites";

const LIMITES = {
  perdaDiariaMaxima: "25.5",
  exposicaoMaxima: "500",
  riscoPorOperacao: "10",
  ordensPorHoraMax: 4,
  pausaAposPerdaMin: 60,
  confiancaMinima: 0.65,
  diasDeEvento: "ignorar" as const,
};

describe("limites de risco", () => {
  it("vai e volta entre o contrato e os campos", () => {
    const campos = deLimites(LIMITES);
    expect(campos.perdaDiariaMaxima).toBe("25,5");
    expect(campos.confiancaMinima).toBe("65");
    expect(validarLimites(campos)).toEqual({ erros: {}, limites: LIMITES });
  });

  it("dias de evento: vai e volta, e valor desconhecido cai no padrão (ignorar)", () => {
    const campos = deLimites({ ...LIMITES, diasDeEvento: "reduzir" });
    expect(campos.diasDeEvento).toBe("reduzir");
    expect(validarLimites(campos).limites?.diasDeEvento).toBe("reduzir");
    expect(validarLimites({ ...campos, diasDeEvento: "qualquer" }).limites?.diasDeEvento).toBe("ignorar");
  });

  it("explica cada campo errado", () => {
    const r = validarLimites({
      ...deLimites(LIMITES),
      exposicaoMaxima: "0",
      ordensPorHoraMax: "200",
      confiancaMinima: "x",
    });
    expect(r.limites).toBeNull();
    expect(Object.keys(r.erros).sort()).toEqual(["confiancaMinima", "exposicaoMaxima", "ordensPorHoraMax"]);
  });
});
