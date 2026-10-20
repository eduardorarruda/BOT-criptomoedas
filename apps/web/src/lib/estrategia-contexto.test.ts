import { avaliar } from "@zentrade/dominio";
import { describe, expect, it } from "vitest";
import { contextoDeVelas } from "./estrategia";

describe("contexto das velas da API", () => {
  it("leva a abertura de cada vela, para a prévia da regra de horário", () => {
    // 15:00 UTC = 12:00 em Brasília
    const abertura = Date.UTC(2026, 9, 20, 15, 0);
    const ctx = contextoDeVelas([
      { abertura, abre: "100", maxima: "101", minima: "99", fecha: "100.5", volume: "10" },
    ]);
    expect(ctx.instantes).toEqual([abertura]);
    expect(avaliar({ tipo: "horario", de: "12:00", ate: "13:00" }, ctx).valor).toBe(true);
    expect(avaliar({ tipo: "horario", de: "13:00", ate: "14:00" }, ctx).valor).toBe(false);
  });
});
