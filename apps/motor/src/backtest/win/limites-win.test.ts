import { ConfiguracaoBacktestEsquema } from "@zentrade/contratos";
import { dec } from "@zentrade/dominio";
import { describe, expect, it } from "vitest";
import { limitesDoWin } from "./limites-win.js";

const config = (extra: object = {}) =>
  ConfiguracaoBacktestEsquema.parse({ mercado: "win", win: { riscoPorOperacao: "300" }, ...extra });

describe("limites do backtest do mini índice", () => {
  it("padrão: a perda diária comporta 3 perdas cheias (antes, 2% de R$ 10.000 = R$ 200 < R$ 300 de risco)", () => {
    const r = limitesDoWin(config(), dec(10_000), dec(300));
    expect(r.limites.perdaDiariaMaxima.toString()).toBe("900");
    expect(r.avisos).toEqual([]);
  });

  it("padrão já coerente: não mexe", () => {
    const r = limitesDoWin(config(), dec(100_000), dec(300));
    expect(r.limites.perdaDiariaMaxima.toString()).toBe("2000");
    expect(r.avisos).toEqual([]);
  });

  it("limites informados com perda diária menor que o risco: respeita e avisa", () => {
    const limites = {
      perdaDiariaMaxima: "200",
      exposicaoMaxima: "3000",
      riscoPorOperacao: "50",
      ordensPorHoraMax: 4,
      pausaAposPerdaMin: 60,
      confiancaMinima: 0.65,
    };
    const r = limitesDoWin(config({ risco: { modo: "robo", limites } }), dec(10_000), dec(300));
    expect(r.limites.perdaDiariaMaxima.toString()).toBe("200");
    expect(r.avisos).toHaveLength(1);
    expect(r.avisos[0]).toMatchObject({ codigo: "perda_diaria_menor_que_risco", nivel: "alerta" });
    expect(r.avisos[0]?.mensagem).toContain("R$ 300");
  });

  it("sem limites: nada a ajustar nem avisar", () => {
    const r = limitesDoWin(config({ risco: { modo: "sem_limites" } }), dec(10_000), dec(300));
    expect(r.avisos).toEqual([]);
  });
});
