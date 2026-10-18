import { dec } from "@zentrade/dominio";
import { describe, expect, it } from "vitest";
import { aplicarRegraDosCenarios, LIMIAR_PADRAO, valorEsperado } from "./cenarios.js";
import { pedidoExemplo } from "./teste/pedido.js";
import { CENARIOS, comProbabilidades, PROPOSTA_GERADA } from "./teste/proposta.js";

const posicaoAberta = {
  quantidade: dec("0.01"),
  precoMedio: dec("60000"),
  resultadoRealizado: dec(0),
  taxasPagas: dec(0),
};

describe("valor esperado (calculado no código, nunca pelo modelo)", () => {
  it("Σ probabilidade × resultado, em decimal exato", () => {
    expect(valorEsperado(CENARIOS)).toBe(0.345);
  });

  it("não sofre com o ponto flutuante (0,1 × 0,2 + ...)", () => {
    const c = CENARIOS.map((x, i) => ({
      ...x,
      probabilidade: [0.1, 0.2, 0.7][i]!,
      resultadoEstimado: [0.2, 0.1, 0.3][i]!,
    }));
    expect(valorEsperado(c)).toBe(0.25);
  });
});

describe("regra dos cenários", () => {
  it("compra com valor esperado positivo e cenário favorável acima do limiar passa", () => {
    const p = aplicarRegraDosCenarios(
      { ...PROPOSTA_GERADA, cenarios: comProbabilidades(0.6, 0.25, 0.15) },
      pedidoExemplo(),
      0.55,
    );
    expect(p.acao).toBe("comprar");
    expect(p.avaliacao).toMatchObject({
      aplicada: true,
      aprovada: true,
      favoravel: "alta",
      probabilidadeFavoravel: 0.6,
      limiar: 0.55,
    });
    expect(p.avaliacao?.valorEsperado).toBeCloseTo(0.6 * 1.2 - 0.25 * 0.25 - 0.15 * 0.9, 10);
  });

  it("a confiança não passa da probabilidade do cenário favorável", () => {
    const p = aplicarRegraDosCenarios(
      { ...PROPOSTA_GERADA, confianca: 0.9, cenarios: comProbabilidades(0.6, 0.25, 0.15) },
      pedidoExemplo(),
      0.55,
    );
    expect(p.confianca).toBe(0.6);
  });

  it("cenário favorável abaixo do limiar vira aguardar, com o motivo, guardando cenários e contra-argumento", () => {
    const p = aplicarRegraDosCenarios(PROPOSTA_GERADA, pedidoExemplo(), 0.6);
    expect(p).toMatchObject({ acao: "aguardar", tamanhoRelativo: 0, confianca: 0 });
    expect(p.stop).toBeUndefined();
    expect(p.alvo).toBeUndefined();
    expect(p.avaliacao).toMatchObject({ aplicada: true, aprovada: false, probabilidadeFavoravel: 0.5 });
    expect(p.avaliacao?.motivo).toMatch(/50% < limiar de 60%/);
    expect(p.justificativa).toMatch(/^Regra dos cenários: /);
    expect(p.cenarios).toEqual(CENARIOS);
    expect(p.contraArgumento).toBe(PROPOSTA_GERADA.contraArgumento);
  });

  it("valor esperado ≤ 0 vira aguardar, mesmo com o favorável acima do limiar", () => {
    const ruins = CENARIOS.map((c) => ({ ...c, resultadoEstimado: c.nome === "alta" ? 0.3 : -1.5 }));
    const p = aplicarRegraDosCenarios(
      {
        ...PROPOSTA_GERADA,
        cenarios: ruins.map((c) => ({ ...c, probabilidade: c.nome === "alta" ? 0.7 : 0.15 })),
      },
      pedidoExemplo(),
      0.6,
    );
    expect(p.acao).toBe("aguardar");
    expect(p.avaliacao?.valorEsperado).toBeCloseTo(0.7 * 0.3 - 0.3 * 1.5, 10);
    expect(p.avaliacao?.motivo).toMatch(/valor esperado líquido −0,24% não é positivo/);
  });

  it("aguardar: a avaliação só informa (a regra vale para abrir posição)", () => {
    const p = aplicarRegraDosCenarios(
      { ...PROPOSTA_GERADA, acao: "aguardar", tamanhoRelativo: 0 },
      pedidoExemplo(),
      0.6,
    );
    expect(p.acao).toBe("aguardar");
    expect(p.avaliacao).toMatchObject({ aplicada: false, aprovada: true });
  });

  it("vender para sair da posição aberta nunca é barrado pela regra (barrar seria manter o risco)", () => {
    const pedido = pedidoExemplo({
      sinal: { acao: "VENDER", motivo: "regra de saída", explicacao: "saiu" },
      posicao: posicaoAberta,
    });
    const p = aplicarRegraDosCenarios({ ...PROPOSTA_GERADA, acao: "vender" }, pedido, 0.9);
    expect(p.acao).toBe("vender");
    expect(p.avaliacao).toMatchObject({ aplicada: false, favoravel: "alta" });
  });

  it("abrir vendido (WIN): o favorável é a baixa", () => {
    const pedido = pedidoExemplo({
      operacao: {
        sentido: "vendido",
        custos: {
          mercado: "win",
          tarifaPorContrato: "0.25",
          corretagemPorContrato: "0",
          deslizamentoTicks: 1,
        },
        stopPercentual: 0.003,
        alvoLiquido: 0.01,
      },
    });
    const vendida = CENARIOS.map((c) => ({
      ...c,
      probabilidade: c.nome === "baixa" ? 0.6 : 0.2,
      resultadoEstimado: c.nome === "baixa" ? 0.4 : -0.2,
    }));
    const p = aplicarRegraDosCenarios(
      { ...PROPOSTA_GERADA, acao: "vender", cenarios: vendida },
      pedido,
      0.55,
    );
    expect(p.acao).toBe("vender");
    expect(p.avaliacao).toMatchObject({ favoravel: "baixa", probabilidadeFavoravel: 0.6, aprovada: true });
  });

  it("o limiar padrão é 0,6", () => {
    expect(LIMIAR_PADRAO).toBe(0.6);
  });
});
