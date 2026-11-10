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

  it("o limiar padrão é 0,3: o critério principal é o valor esperado, não a chance de acerto", () => {
    expect(LIMIAR_PADRAO).toBe(0.3);
  });

  it("tendência que acerta pouco e ganha muito: 42% de alta com valor esperado positivo passa no padrão", () => {
    // o sinal de BNB de 20/10 21:59, barrado pelo limiar antigo de 60% (o preço subiu 0,9% depois)
    const p = aplicarRegraDosCenarios(
      { ...PROPOSTA_GERADA, confianca: 0.7, cenarios: comProbabilidades(0.42, 0.33, 0.25) },
      pedidoExemplo(),
    );
    expect(p.acao).toBe("comprar");
    expect(p.avaliacao).toMatchObject({ aprovada: true, probabilidadeFavoravel: 0.42, limiar: 0.3 });
    expect(p.confianca).toBe(0.42);
  });

  describe("o modelo propôs aguardar, mas os próprios cenários dele compensam", () => {
    const aguardar = (extra: Partial<typeof PROPOSTA_GERADA> = {}) => {
      const { stop: _s, alvo: _a, ...sem } = PROPOSTA_GERADA;
      return { ...sem, acao: "aguardar" as const, confianca: 0.6, tamanhoRelativo: 0, ...extra };
    };

    it("valor esperado > 0 e chance ≥ limiar: a regra decide pela entrada (como o P1 de 21/10 10:29)", () => {
      const p = aplicarRegraDosCenarios(
        aguardar({ cenarios: comProbabilidades(0.36, 0.32, 0.32) }),
        pedidoExemplo(),
      );
      expect(p.acao).toBe("comprar");
      expect(p.tamanhoRelativo).toBe(1);
      expect(p.confianca).toBe(0.36);
      expect(p.avaliacao).toMatchObject({ aplicada: true, aprovada: true });
      expect(p.avaliacao?.motivo).toMatch(/os cenários do próprio modelo/);
    });

    it("com um veto grave concreto, continua aguardando e diz por quê", () => {
      const p = aplicarRegraDosCenarios(
        aguardar({
          cenarios: comProbabilidades(0.36, 0.32, 0.32),
          vetoGrave: "notícia de hack na corretora",
        }),
        pedidoExemplo(),
      );
      expect(p.acao).toBe("aguardar");
      expect(p.avaliacao).toMatchObject({ aplicada: true, aprovada: false });
      expect(p.avaliacao?.motivo).toMatch(/veto grave: notícia de hack/);
    });

    it("valor esperado ≤ 0: continua aguardando", () => {
      const p = aplicarRegraDosCenarios(
        aguardar({ cenarios: comProbabilidades(0.2, 0.4, 0.4) }),
        pedidoExemplo(),
      );
      expect(p.acao).toBe("aguardar");
    });

    it("com posição aberta, aguardar não vira entrada", () => {
      const p = aplicarRegraDosCenarios(
        aguardar({ cenarios: comProbabilidades(0.6, 0.2, 0.2) }),
        pedidoExemplo({ posicao: posicaoAberta }),
      );
      expect(p.acao).toBe("aguardar");
    });
  });
});

describe("regra dos cenários com o histórico medido (máquina do tempo)", () => {
  const TOTAL = { operacoes: 120, certas: 48, resultadoMedio: 0.08 };
  const comHistorico = (recortes: object = {}) =>
    pedidoExemplo({ historico: { fonte: "WIN 15m, mesma regra", total: TOTAL, ...recortes } });

  it("histórico negativo na mesma faixa de horário barra a entrada, mesmo com os cenários do modelo a favor", () => {
    const p = aplicarRegraDosCenarios(
      { ...PROPOSTA_GERADA, cenarios: comProbabilidades(0.6, 0.25, 0.15) },
      comHistorico({ mesmoHorario: { operacoes: 31, certas: 9, resultadoMedio: -0.05 } }),
    );
    expect(p).toMatchObject({ acao: "aguardar", tamanhoRelativo: 0, confianca: 0 });
    expect(p.avaliacao).toMatchObject({ aplicada: true, aprovada: false, valorEsperado: -0.05 });
    expect(p.avaliacao?.motivo).toMatch(/mesma faixa de horário/);
    expect(p.justificativa).toMatch(/^Regra do histórico/);
  });

  it("histórico positivo decide pela entrada mesmo com o modelo propondo aguardar", () => {
    const p = aplicarRegraDosCenarios(
      {
        ...PROPOSTA_GERADA,
        acao: "aguardar",
        tamanhoRelativo: 0,
        cenarios: comProbabilidades(0.2, 0.5, 0.3),
      },
      comHistorico({ mesmoHorario: { operacoes: 25, certas: 12, resultadoMedio: 0.1 } }),
    );
    expect(p.acao).toBe("comprar");
    expect(p.tamanhoRelativo).toBe(1);
    expect(p.confianca).toBe(0.48);
    expect(p.avaliacao).toMatchObject({
      aplicada: true,
      aprovada: true,
      valorEsperado: 0.1,
      probabilidadeFavoravel: 0.48,
    });
  });

  it("o modelo ainda pode reduzir o tamanho quando o histórico aprova", () => {
    const p = aplicarRegraDosCenarios(PROPOSTA_GERADA, comHistorico());
    expect(p).toMatchObject({ acao: "comprar", tamanhoRelativo: 0.5 });
  });

  it("um veto grave concreto do modelo segura a entrada que o histórico aprovaria", () => {
    const p = aplicarRegraDosCenarios(
      { ...PROPOSTA_GERADA, acao: "aguardar", tamanhoRelativo: 0, vetoGrave: "Copom em 10 minutos" },
      comHistorico(),
    );
    expect(p.acao).toBe("aguardar");
    expect(p.avaliacao).toMatchObject({ aplicada: true, aprovada: false });
    expect(p.avaliacao?.motivo).toMatch(/veto grave: Copom em 10 minutos/);
  });

  it("recorte pequeno não vale: cai para o mesmo lado e depois para o total", () => {
    const pequeno = { operacoes: 5, certas: 0, resultadoMedio: -1 };
    const ladoPositivo = aplicarRegraDosCenarios(
      PROPOSTA_GERADA,
      comHistorico({ mesmoHorario: pequeno, mesmoLado: { operacoes: 40, certas: 18, resultadoMedio: 0.2 } }),
    );
    expect(ladoPositivo.avaliacao).toMatchObject({ aprovada: true, valorEsperado: 0.2 });
    expect(ladoPositivo.avaliacao?.motivo).toMatch(/mesmo lado/);
    const total = aplicarRegraDosCenarios(PROPOSTA_GERADA, comHistorico({ mesmoHorario: pequeno }));
    expect(total.avaliacao).toMatchObject({ aprovada: true, valorEsperado: 0.08 });
    expect(total.avaliacao?.motivo).toMatch(/120 operações/);
  });

  it("amostra total pequena: vale a regra dos cenários do modelo, como antes", () => {
    const pedido = pedidoExemplo({
      historico: { fonte: "WIN 1h", total: { operacoes: 10, certas: 6, resultadoMedio: 0.5 } },
    });
    const p = aplicarRegraDosCenarios(PROPOSTA_GERADA, pedido, 0.6);
    expect(p.acao).toBe("aguardar");
    expect(p.avaliacao?.motivo).toMatch(/limiar/);
  });

  it("a saída de uma posição aberta não é barrada pelo histórico", () => {
    const p = aplicarRegraDosCenarios(
      { ...PROPOSTA_GERADA, acao: "vender" },
      pedidoExemplo({
        posicao: posicaoAberta,
        sinal: { acao: "VENDER", motivo: "regra de saída", explicacao: "saiu" },
        historico: { fonte: "x", total: { operacoes: 100, certas: 10, resultadoMedio: -2 } },
      }),
    );
    expect(p.acao).toBe("vender");
    expect(p.avaliacao?.aplicada).toBe(false);
  });
});

describe("médias pequenas do histórico", () => {
  it('mostra até 4 casas (não vira "0%")', () => {
    const p = aplicarRegraDosCenarios(
      PROPOSTA_GERADA,
      pedidoExemplo({
        historico: { fonte: "x", total: { operacoes: 98, certas: 37, resultadoMedio: -0.0048 } },
      }),
    );
    expect(p.avaliacao?.motivo).toMatch(/−0,0048% por operação/);
  });
});
