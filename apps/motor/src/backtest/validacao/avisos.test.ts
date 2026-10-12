import { describe, expect, it } from "vitest";
import { avisosDoBacktest, type EntradaAvisos } from "./avisos.js";

const base: EntradaAvisos = {
  operacoes: 150,
  dias: 400,
  semLimites: false,
  mercadoPorJanela: [0.1, -0.05, 0.02],
  candlesAmbiguos: 0,
  precisaoMinuto: false,
};
const codigos = (e: Partial<EntradaAvisos>) => avisosDoBacktest({ ...base, ...e }).map((a) => a.codigo);

describe("avisos de amostra mínima (regras práticas)", () => {
  it("amostra boa: nenhum aviso", () => {
    expect(avisosDoBacktest(base)).toEqual([]);
  });

  it("operações: nenhuma, poucas (com Monte Carlo pulado), moderadas", () => {
    expect(codigos({ operacoes: 0 })).toEqual(["nenhuma_operacao"]);
    expect(codigos({ operacoes: 3 })).toEqual(["poucas_operacoes", "sem_monte_carlo"]);
    expect(codigos({ operacoes: 12 })).toEqual(["poucas_operacoes"]);
    expect(codigos({ operacoes: 60 })).toEqual(["operacoes_moderadas"]);
  });

  it("período curto e menos de um ano", () => {
    expect(codigos({ dias: 30 })).toEqual(["periodo_curto"]);
    expect(codigos({ dias: 180 })).toEqual(["menos_de_um_ano"]);
  });

  it("um regime só: mercado subiu (ou caiu) em todas as janelas", () => {
    expect(codigos({ mercadoPorJanela: [0.1, 0.2, 0.05] })).toEqual(["so_alta"]);
    expect(codigos({ mercadoPorJanela: [-0.1, -0.2] })).toEqual(["so_queda"]);
    expect(codigos({ mercadoPorJanela: [0.1] })).toEqual([]);
  });

  it("realismo: sem limites e candles ambíguos sem a precisão de 1 minuto", () => {
    expect(codigos({ semLimites: true })).toEqual(["sem_limites"]);
    expect(codigos({ candlesAmbiguos: 2 })).toEqual(["candles_ambiguos"]);
    expect(codigos({ candlesAmbiguos: 2, precisaoMinuto: true })).toEqual([]);
  });

  it("todo aviso diz que é regra prática e fala português claro", () => {
    const todos = avisosDoBacktest({ ...base, operacoes: 3, dias: 10, semLimites: true, candlesAmbiguos: 1 });
    expect(todos.every((a) => a.base === "heuristica")).toBe(true);
    expect(todos.find((a) => a.codigo === "poucas_operacoes")?.mensagem).toMatch(/Só 3 operações/);
  });
});
