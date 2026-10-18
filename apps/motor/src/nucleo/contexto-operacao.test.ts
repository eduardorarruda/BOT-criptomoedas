import { OperacaoPedidoEsquema, VelasPedidoEsquema } from "@zentrade/contratos";
import { MODELOS, MODELOS_WIN, type ContextoMercado } from "@zentrade/dominio";
import { describe, expect, it } from "vitest";
import { custosCriptoDoPedido, operacaoDoPedido, velasDoPedido } from "./contexto-operacao.js";

const modelo = (id: string) => {
  const m = [...MODELOS, ...MODELOS_WIN].find((x) => x.id === id);
  if (!m) throw new Error(`modelo ${id} não existe`);
  return m.estrategia;
};

describe("operação no pedido ao agente", () => {
  it("cripto: taxa real da estratégia por lado e o deslizamento + meio spread do backtest", () => {
    const e = modelo("donchian-20-10");
    const op = operacaoDoPedido(e, custosCriptoDoPedido(e), "comprado");
    expect(op.custos).toEqual({
      mercado: "cripto",
      taxaPorLado: 0.001,
      deslizamentoBps: 5,
      meioSpreadBps: 2,
    });
    expect(OperacaoPedidoEsquema.safeParse(op).success).toBe(true);
  });

  it("leva como a posição sai: regra de saída em texto, stop por ATR, alvo distante", () => {
    const e = modelo("donchian-20-10");
    const op = operacaoDoPedido(e, custosCriptoDoPedido(e), "comprado");
    expect(op.regraSaida).toBe("preço < fundo de Donchian(10)");
    expect(op.stopPercentual).toBe(0.1);
    expect(op.stopAtr).toEqual({ periodo: 20, multiplo: 2 });
    expect(op.alvoLiquido).toBe(0.6);
    expect(op.tamanhoPorVolatilidade).toEqual({ periodo: 20, multiplo: 2 });
  });

  it("stop móvel, empate e tempo máximo vão quando a estratégia tem", () => {
    const e = {
      ...modelo("donchian-20-10"),
      stopMovel: { tipo: "percentual" as const, distancia: 0.03 },
      empate: { gatilho: 0.02 },
      tempoMaximo: 48,
    };
    const op = operacaoDoPedido(e, custosCriptoDoPedido(e), "comprado");
    expect(op.stopMovel).toEqual({ tipo: "percentual", distancia: 0.03 });
    expect(op.empate).toEqual({ gatilho: 0.02 });
    expect(op.tempoMaximo).toBe(48);
  });

  it("WIN vendido: usa a regra de saída vendida e os custos por contrato", () => {
    const e = MODELOS_WIN[0]!.estrategia;
    const op = operacaoDoPedido(
      e,
      { mercado: "win", tarifaPorContrato: "0.25", corretagemPorContrato: "0", deslizamentoTicks: 1 },
      "vendido",
    );
    expect(op.sentido).toBe("vendido");
    expect(op.custos.mercado).toBe("win");
    expect(op.regraSaida).toMatch(/^preço > /);
    expect(OperacaoPedidoEsquema.safeParse(op).success).toBe(true);
  });
});

describe("velas no pedido ao agente", () => {
  it("leva máximas, mínimas, volumes e instantes alinhados com os fechamentos", () => {
    const ctx: ContextoMercado = {
      fechamentos: [10, 11],
      maximas: [10.5, 11.5],
      minimas: [9.5, 10.5],
      volumes: [100, 120],
      instantes: [1_000, 2_000],
    };
    const v = velasDoPedido(ctx);
    expect(v).toEqual({
      instantes: [1_000, 2_000],
      maximas: [10.5, 11.5],
      minimas: [9.5, 10.5],
      volumes: [100, 120],
    });
    expect(VelasPedidoEsquema.safeParse(v).success).toBe(true);
  });

  it("sem as séries completas, não manda velas (o agente segue só com os fechamentos)", () => {
    expect(velasDoPedido({ fechamentos: [10, 11] })).toBeUndefined();
    expect(
      velasDoPedido({
        fechamentos: [10, 11],
        maximas: [1],
        minimas: [1, 2],
        volumes: [1, 2],
        instantes: [1, 2],
      }),
    ).toBeUndefined();
  });
});
