import { describe, expect, it } from "vitest";
import { interpolarDecimal } from "./interpolar";

describe("interpolarDecimal", () => {
  it("vai do valor antigo ao novo sem usar float", () => {
    expect(interpolarDecimal("10.00", "20.00", 0)).toBe("10");
    expect(interpolarDecimal("10.00", "20.00", 0.5)).toBe("15");
    expect(interpolarDecimal("10.00", "20.00", 1)).toBe("20.00");
  });

  it("termina exatamente no texto novo", () => {
    expect(interpolarDecimal("0.1", "0.3", 1)).toBe("0.3");
  });

  it("limita o progresso entre 0 e 1", () => {
    expect(interpolarDecimal("-5", "5", -1)).toBe("-5");
    expect(interpolarDecimal("-5", "5", 2)).toBe("5");
  });

  it("usa o destino quando a origem é inválida", () => {
    expect(interpolarDecimal("x", "7.5", 0.3)).toBe("7.5");
  });
});
