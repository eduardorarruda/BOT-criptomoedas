import { describe, expect, it } from "vitest";
import { dec } from "../dinheiro.js";
import {
  contratosPeloRisco,
  CUSTOS_WIN_PADRAO,
  custoFixoPorLado,
  custoIdaEVoltaWin,
  MARGEM_DAY_TRADE_WIN,
  noTick,
  pontosDosReais,
  precoExecutado,
  reaisDosPontos,
  TICK_WIN,
  VALOR_DO_PONTO_WIN,
  type CustosWin,
} from "./win.js";

const custos: CustosWin = { tarifaB3: dec("0.25"), corretagem: dec(0), deslizamentoTicks: 1 };

describe("contrato do mini índice: pontos ↔ reais", () => {
  it("R$ 0,20 por ponto por contrato; tick de 5 pontos = R$ 1,00", () => {
    expect(VALOR_DO_PONTO_WIN.toString()).toBe("0.2");
    expect(TICK_WIN.toNumber()).toBe(5);
    expect(reaisDosPontos(TICK_WIN).toString()).toBe("1");
    // a tabela da nota 01: 100 pontos = R$ 20; 1.000 pontos = R$ 200
    expect(reaisDosPontos(dec(100)).toString()).toBe("20");
    expect(reaisDosPontos(dec(1000)).toString()).toBe("200");
    // 150 pontos em 3 contratos = R$ 90; e a volta
    expect(reaisDosPontos(dec(150), 3).toString()).toBe("90");
    expect(pontosDosReais(dec(90), 3).toString()).toBe("150");
    expect(reaisDosPontos(dec(-50), 2).toString()).toBe("-20");
    expect(MARGEM_DAY_TRADE_WIN.toNumber()).toBe(155);
  });

  it("ponto em reais de um contrato a 130.000 pontos: cerca de R$ 26.000 de exposição", () => {
    expect(reaisDosPontos(dec(130_000)).toString()).toBe("26000");
  });
});

describe("ticks e execução", () => {
  it("arredonda ao tick contra quem opera: compra para cima, venda para baixo", () => {
    expect(noTick(dec("130001.37"), "COMPRA").toString()).toBe("130005");
    expect(noTick(dec("130001.37"), "VENDA").toString()).toBe("130000");
    expect(noTick(dec(130_005), "COMPRA").toString()).toBe("130005");
    expect(noTick(dec(130_005), "VENDA").toString()).toBe("130005");
  });

  it("o deslizamento soma ticks contra: compra mais cara, venda mais barata", () => {
    expect(precoExecutado(dec(130_000), "COMPRA", 1).toString()).toBe("130005");
    expect(precoExecutado(dec(130_000), "VENDA", 2).toString()).toBe("129990");
    expect(precoExecutado(dec("130002.5"), "VENDA", 1).toString()).toBe("129995");
    expect(precoExecutado(dec(130_000), "COMPRA", 0).toString()).toBe("130000");
  });

  it("propriedade: o preço executado está no tick e nunca é melhor que a referência", () => {
    for (let i = 0; i < 300; i++) {
      const ref = dec(100_000 + i * 7.31);
      const ticks = i % 4;
      const compra = precoExecutado(ref, "COMPRA", ticks);
      const venda = precoExecutado(ref, "VENDA", ticks);
      expect(compra.mod(5).isZero() && venda.mod(5).isZero()).toBe(true);
      expect(compra.gte(ref.plus(ticks * 5))).toBe(true);
      expect(venda.lte(ref.minus(ticks * 5))).toBe(true);
      expect(compra.minus(ref).lt(5 * (ticks + 1))).toBe(true);
    }
  });
});

describe("custos por contrato", () => {
  it("tarifa da B3 + corretagem em cada lado; ida e volta com 1 tick por lado = R$ 2,50", () => {
    expect(custoFixoPorLado(custos).toString()).toBe("0.25");
    // nota 03: tarifas R$ 0,50 + deslizamento R$ 2,00 = R$ 2,50 (12,5 pontos)
    expect(custoIdaEVoltaWin(custos).toString()).toBe("2.5");
    expect(custoIdaEVoltaWin({ ...custos, corretagem: dec("0.5"), deslizamentoTicks: 0 }).toString()).toBe(
      "1.5",
    );
    expect(custoIdaEVoltaWin(CUSTOS_WIN_PADRAO).toString()).toBe("2.5");
  });
});

describe("dimensionamento pelo risco em reais", () => {
  const pedido = {
    riscoPorOperacao: dec(50),
    distanciaPontos: dec(150),
    custos,
    contratosMaximos: 10,
    margemPorContrato: dec(155),
    capital: dec(10_000),
  };

  it("exemplo da nota 04: 50 ÷ (150 × 0,20 + 2,50) = 1,5 → 1 contrato", () => {
    const d = contratosPeloRisco(pedido);
    expect(d.contratos).toBe(1);
    expect(d.limite).toBe("risco");
    expect(d.perdaPorContrato.toString()).toBe("32.5");
    expect(d.explicacao).toMatch(/R\$ 50,00 ÷ R\$ 32,50 por contrato/);
  });

  it("arredonda sempre para baixo; zero quando não cabe nem um", () => {
    expect(contratosPeloRisco({ ...pedido, riscoPorOperacao: dec(325) }).contratos).toBe(10);
    expect(contratosPeloRisco({ ...pedido, riscoPorOperacao: dec("324.99") }).contratos).toBe(9);
    const nada = contratosPeloRisco({ ...pedido, riscoPorOperacao: dec(30) });
    expect(nada.contratos).toBe(0);
    expect(nada.explicacao).toMatch(/não cabe nem 1 contrato/);
  });

  it("limitado pelo máximo de contratos", () => {
    const d = contratosPeloRisco({ ...pedido, riscoPorOperacao: dec(1000), contratosMaximos: 3 });
    expect(d).toMatchObject({ contratos: 3, limite: "maximo", porRisco: 30 });
  });

  it("limitado pela margem contra o capital (R$ 155 por contrato)", () => {
    const d = contratosPeloRisco({ ...pedido, riscoPorOperacao: dec(1000), capital: dec(500) });
    expect(d).toMatchObject({ contratos: 3, limite: "margem", porMargem: 3 });
    expect(d.explicacao).toMatch(/margem/);
    expect(contratosPeloRisco({ ...pedido, capital: dec(-10) }).contratos).toBe(0);
  });

  it("propriedade: nunca passa do risco, do máximo nem da margem", () => {
    for (let i = 1; i < 400; i++) {
      const p = {
        ...pedido,
        riscoPorOperacao: dec(10 + ((i * 37) % 900)),
        distanciaPontos: dec(5 * (1 + (i % 120))),
        contratosMaximos: 1 + (i % 15),
        capital: dec(100 + ((i * 131) % 5000)),
      };
      const d = contratosPeloRisco(p);
      expect(Number.isInteger(d.contratos) && d.contratos >= 0).toBe(true);
      expect(d.perdaPorContrato.times(d.contratos).lte(p.riscoPorOperacao)).toBe(true);
      expect(d.contratos).toBeLessThanOrEqual(p.contratosMaximos);
      expect(p.margemPorContrato.times(d.contratos).lte(p.capital)).toBe(true);
      // e é o maior que cabe: um a mais estoura alguma das três
      const mais = d.contratos + 1;
      const cabe =
        d.perdaPorContrato.times(mais).lte(p.riscoPorOperacao) &&
        mais <= p.contratosMaximos &&
        p.margemPorContrato.times(mais).lte(p.capital);
      expect(cabe).toBe(false);
    }
  });

  it("distância do stop precisa ser positiva", () => {
    expect(() => contratosPeloRisco({ ...pedido, distanciaPontos: dec(0) })).toThrow(RangeError);
  });
});
