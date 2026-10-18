import { describe, expect, it } from "vitest";
import {
  AvaliacaoCenariosEsquema,
  CenariosEsquema,
  PropostaAgenteEsquema,
  PropostaGeradaEsquema,
} from "./proposta.js";

const cenarios = [
  {
    nome: "alta",
    probabilidade: 0.5,
    horizonte: 12,
    gatilho: "fechar acima de 60.600",
    invalidacao: "fechar abaixo de 60.200",
    resultadoEstimado: 1.2,
  },
  {
    nome: "lateral",
    probabilidade: 0.3,
    horizonte: 24,
    gatilho: "ficar entre 60.200 e 60.600",
    invalidacao: "romper qualquer ponta",
    resultadoEstimado: -0.25,
  },
  {
    nome: "baixa",
    probabilidade: 0.2,
    horizonte: 6,
    gatilho: "perder 60.200",
    invalidacao: "voltar acima de 60.450",
    resultadoEstimado: -0.9,
  },
];

const antiga = {
  acao: "comprar",
  confianca: 0.7,
  tamanhoRelativo: 1,
  stop: "58800",
  alvo: "61000",
  justificativa: "preço abaixo da média",
  riscos: [],
  fontes: [],
};

const gerada = { ...antiga, cenarios, contraArgumento: "o volume não confirma o rompimento" };

describe("cenários da proposta", () => {
  it("aceita três cenários distintos com probabilidades somando 1", () => {
    expect(CenariosEsquema.safeParse(cenarios).success).toBe(true);
  });

  it("tolera arredondamento de até 0,01 na soma", () => {
    const quase = cenarios.map((c, i) => (i === 0 ? { ...c, probabilidade: 0.509 } : c));
    expect(CenariosEsquema.safeParse(quase).success).toBe(true);
  });

  it("recusa probabilidades que não somam 1", () => {
    const r = CenariosEsquema.safeParse(cenarios.map((c) => ({ ...c, probabilidade: 0.5 })));
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error?.issues)).toMatch(/somar 1/);
  });

  it("recusa cenário repetido ou faltando", () => {
    const repetido = [cenarios[0], { ...cenarios[1], nome: "alta" }, cenarios[2]];
    expect(CenariosEsquema.safeParse(repetido).success).toBe(false);
    expect(CenariosEsquema.safeParse(cenarios.slice(0, 2)).success).toBe(false);
  });

  it("recusa número não finito e horizonte não inteiro", () => {
    const infinito = cenarios.map((c, i) => (i === 0 ? { ...c, resultadoEstimado: Infinity } : c));
    expect(CenariosEsquema.safeParse(infinito).success).toBe(false);
    const quebrado = cenarios.map((c, i) => (i === 0 ? { ...c, horizonte: 1.5 } : c));
    expect(CenariosEsquema.safeParse(quebrado).success).toBe(false);
  });
});

describe("proposta gerada x proposta lida", () => {
  it("a geração nova exige cenários e contra-argumento", () => {
    expect(PropostaGeradaEsquema.safeParse(gerada).success).toBe(true);
    expect(PropostaGeradaEsquema.safeParse(antiga).success).toBe(false);
    expect(PropostaGeradaEsquema.safeParse({ ...gerada, contraArgumento: "" }).success).toBe(false);
  });

  it("a leitura aceita proposta antiga, sem cenários (compatibilidade)", () => {
    expect(PropostaAgenteEsquema.safeParse(antiga).success).toBe(true);
  });

  it("a leitura aceita a proposta nova com a avaliação calculada no código", () => {
    const avaliacao = {
      valorEsperado: 0.3,
      favoravel: "alta",
      probabilidadeFavoravel: 0.5,
      limiar: 0.55,
      aplicada: true,
      aprovada: false,
      motivo: "probabilidade do cenário favorável abaixo do limiar",
    };
    expect(AvaliacaoCenariosEsquema.safeParse(avaliacao).success).toBe(true);
    expect(PropostaAgenteEsquema.safeParse({ ...gerada, avaliacao }).success).toBe(true);
  });

  it("a leitura ainda valida os cenários quando eles vêm", () => {
    const torta = { ...gerada, cenarios: cenarios.map((c) => ({ ...c, probabilidade: 0.9 })) };
    expect(PropostaAgenteEsquema.safeParse(torta).success).toBe(false);
  });
});
