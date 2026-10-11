import type { DecisaoDTO, EstrategiaDTO, PosicaoDTO } from "@zentrade/contratos/esquemas";
import { describe, expect, it } from "vitest";
import { compraQueAbriu, linhasProtecao } from "./protecao";

const ESTRATEGIA = {
  id: "e",
  nome: "e",
  versao: 1,
  entrada: {
    tipo: "comparar",
    esquerda: { tipo: "preco" },
    comparador: "<",
    direita: { tipo: "numero", valor: 1 },
  },
  stop: 0.02,
  alvoLiquido: 0.01,
  taxa: 0.001,
} satisfies EstrategiaDTO;
const posicao = (quantidade: string, precoMedio = "100"): PosicaoDTO => ({
  roboId: "r",
  simbolo: "BTCUSDT",
  quantidade,
  precoMedio,
  resultadoRealizado: "0",
  taxasPagas: "0",
});
const compra = (
  stop?: string,
  alvo?: string,
  em = 1,
  estado: DecisaoDTO["estado"] = "executada",
): DecisaoDTO => ({
  id: `d${em}`,
  roboId: "r",
  em,
  sinal: { acao: "COMPRAR", explicacao: "x" },
  preco: "100",
  risco: { aprovada: true, barreiras: [] },
  estado,
  proposta: {
    acao: "comprar",
    confianca: 0.9,
    tamanhoRelativo: 1,
    justificativa: "j",
    riscos: [],
    fontes: [],
    ...(stop ? { stop } : {}),
    ...(alvo ? { alvo } : {}),
  },
});

describe("linhas de stop e alvo", () => {
  it("sem posição ou sem estratégia, nada", () => {
    expect(linhasProtecao(posicao("0"), ESTRATEGIA, undefined)).toBeNull();
    expect(linhasProtecao(posicao("1"), undefined, undefined)).toBeNull();
    expect(linhasProtecao(undefined, ESTRATEGIA, undefined)).toBeNull();
  });

  it("só a regra: stop 2% abaixo do médio, alvo cobrindo as duas taxas", () => {
    const l = linhasProtecao(posicao("1"), ESTRATEGIA, undefined);
    expect(Number(l?.stop)).toBeCloseTo(98, 6);
    expect(Number(l?.alvo)).toBeCloseTo((100 * 1.001 * 1.01) / 0.999, 6);
  });

  it("o agente aperta: stop mais alto e alvo mais baixo (acima do empate) valem", () => {
    const l = linhasProtecao(posicao("1"), ESTRATEGIA, compra("99", "100.5"));
    expect(Number(l?.stop)).toBeCloseTo(99, 6);
    expect(Number(l?.alvo)).toBeCloseTo(100.5, 6);
  });

  it("agente frouxo ou alvo abaixo do empate: fica a regra", () => {
    const l = linhasProtecao(posicao("1"), ESTRATEGIA, compra("90", "100.1"));
    expect(Number(l?.stop)).toBeCloseTo(98, 6);
    expect(Number(l?.alvo)).toBeGreaterThan(101);
  });

  it("a compra que abriu é a executada mais recente", () => {
    const d = [
      compra(undefined, undefined, 1),
      compra(undefined, undefined, 3),
      compra(undefined, undefined, 5, "barrada"),
    ];
    expect(compraQueAbriu(d)?.em).toBe(3);
    expect(compraQueAbriu([])).toBeUndefined();
  });
});
