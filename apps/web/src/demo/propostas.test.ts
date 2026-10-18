import { PropostaAgenteEsquema, type PropostaAgente } from "@zentrade/contratos/esquemas";
import { describe, expect, it } from "vitest";
import { PROPOSTAS, semCenarios } from "./propostas";

const todas: [string, PropostaAgente][] = Object.entries(PROPOSTAS);
const comCenarios = todas.filter(([, p]) => p.cenarios !== undefined);

describe("propostas do exemplo", () => {
  it.each(todas)("%s segue o contrato da proposta", (_, p) => {
    expect(PropostaAgenteEsquema.safeParse(p).success).toBe(true);
  });

  it("tem aprovada, barrada pela regra e antiga sem cenários", () => {
    const avaliacoes = comCenarios.map(([, p]) => p.avaliacao);
    expect(avaliacoes.some((a) => a?.aplicada && a.aprovada)).toBe(true);
    expect(comCenarios.some(([, p]) => p.acao === "aguardar" && p.avaliacao?.aprovada === false)).toBe(true);
    expect(todas.some(([, p]) => p.cenarios === undefined)).toBe(true);
  });

  it.each(comCenarios)("%s: o valor esperado é Σ probabilidade × resultado, em 2 casas", (_, p) => {
    const cenarios = p.cenarios ?? [];
    const soma = cenarios.reduce((s, c) => s + c.probabilidade, 0);
    expect(soma).toBeCloseTo(1, 10);
    const esperado = cenarios.reduce((s, c) => s + c.probabilidade * c.resultadoEstimado, 0);
    expect(p.avaliacao?.valorEsperado).toBe(Math.round(esperado * 100) / 100);
    const favoravel = cenarios.find((c) => c.nome === p.avaliacao?.favoravel);
    expect(p.avaliacao?.probabilidadeFavoravel).toBe(favoravel?.probabilidade);
  });

  it("semCenarios tira só os campos de cenário", () => {
    const sem = semCenarios(PROPOSTAS.btcCompra);
    expect(sem).not.toHaveProperty("cenarios");
    expect(sem).not.toHaveProperty("avaliacao");
    expect(sem).not.toHaveProperty("contraArgumento");
    expect(sem.justificativa).toBe(PROPOSTAS.btcCompra.justificativa);
  });

  it.each(comCenarios)("%s: a confiança da proposta aprovada não passa do cenário favorável", (_, p) => {
    if (p.avaliacao?.aplicada && p.avaliacao.aprovada)
      expect(p.confianca).toBeLessThanOrEqual(p.avaliacao.probabilidadeFavoravel);
  });
});
