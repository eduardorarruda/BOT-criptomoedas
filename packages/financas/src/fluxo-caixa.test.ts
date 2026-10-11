import { dec } from "@zentrade/dominio";
import { describe, expect, it } from "vitest";
import {
  ErroParametroFinanceiro,
  payback,
  paybackDescontado,
  raizPorBissecao,
  taxaAnualDeMensal,
  taxaMensalDeAnual,
  tir,
  tirDatada,
  valorFuturoDatado,
  vpl,
  vplDatado,
} from "./fluxo-caixa.js";

const fluxos = (...v: number[]) => v.map((x) => dec(x));
const dia = (iso: string) => Date.parse(`${iso}T00:00:00Z`);

// Exemplo clássico da documentação do Excel (XNPV/XIRR): resultado conhecido.
const EXEMPLO_XIRR = [
  { data: dia("2008-01-01"), valor: dec(-10000) },
  { data: dia("2008-03-01"), valor: dec(2750) },
  { data: dia("2008-10-30"), valor: dec(4250) },
  { data: dia("2009-02-15"), valor: dec(3250) },
  { data: dia("2009-04-01"), valor: dec(2750) },
];

describe("taxas equivalentes", () => {
  it("12% a.a. efetivos equivalem a 0,948879% a.m.", () => {
    expect(taxaMensalDeAnual(0.12)).toBeCloseTo(0.009488792934583, 14);
  });

  it("1% a.m. equivale a 12,6825% a.a. (juros compostos, não 12%)", () => {
    expect(taxaAnualDeMensal(0.01)).toBeCloseTo(0.12682503013197, 13);
  });

  it("ida e volta devolve a mesma taxa", () => {
    expect(taxaAnualDeMensal(taxaMensalDeAnual(0.0965))).toBeCloseTo(0.0965, 13);
  });

  it("recusa taxa de -100% ou menos", () => {
    expect(() => taxaMensalDeAnual(-1)).toThrow(ErroParametroFinanceiro);
    expect(() => taxaAnualDeMensal(Number.NaN)).toThrow(ErroParametroFinanceiro);
  });
});

describe("VPL", () => {
  it("desconta cada fluxo pelo período (referência: -21,04 a 10%)", () => {
    expect(
      vpl(0.1, fluxos(-1000, 300, 400, 500))
        .toDecimalPlaces(6)
        .toNumber(),
    ).toBeCloseTo(-21.036814, 6);
  });

  it("a taxa zero é a soma simples", () => {
    expect(vpl(0, fluxos(-100, 60, 60)).toString()).toBe("20");
  });

  it("recusa lista vazia", () => {
    expect(() => vpl(0.1, [])).toThrow(/pelo menos um fluxo/);
  });
});

describe("TIR por bisseção", () => {
  it("acha 8,8963% para -1000, 300, 400, 500", () => {
    expect(tir(fluxos(-1000, 300, 400, 500))).toBeCloseTo(0.0889633947, 9);
  });

  it("o VPL na TIR é zero (dentro da tolerância)", () => {
    const f = fluxos(-50000, 8000, 9000, 10000, 12000, 30000);
    const taxa = tir(f)!;
    expect(vpl(taxa, f).abs().toNumber()).toBeLessThan(1e-4);
  });

  it("acha TIR negativa quando se perde dinheiro", () => {
    expect(tir(fluxos(-1000, 400, 400))).toBeCloseTo(-0.13667504, 7);
  });

  it("acha TIR alta, fora do intervalo inicial, ampliando a busca", () => {
    expect(tir(fluxos(-100, 500))).toBeCloseTo(4, 8);
  });

  it("devolve null sem troca de sinal (não existe taxa que zere o VPL)", () => {
    expect(tir(fluxos(100, 200))).toBeNull();
    expect(tir(fluxos(-100, -5))).toBeNull();
  });

  it("respeita a tolerância pedida", () => {
    const grossa = tir(fluxos(-1000, 300, 400, 500), { tolerancia: 1e-3 })!;
    expect(Math.abs(grossa - 0.0889634)).toBeLessThan(1e-3);
  });

  it("recusa tolerância inválida", () => {
    expect(() => tir(fluxos(-1, 2), { tolerancia: 0 })).toThrow(ErroParametroFinanceiro);
  });
});

describe("raiz por bisseção (recursiva)", () => {
  it("acha a raiz de x² - 2 entre 0 e 2", () => {
    expect(raizPorBissecao((x) => x * x - 2, 0, 2, 1e-12, 200)).toBeCloseTo(Math.SQRT2, 11);
  });

  it("devolve a ponta quando ela já é a raiz", () => {
    expect(raizPorBissecao((x) => x - 1, 1, 3, 1e-9, 50)).toBe(1);
    expect(raizPorBissecao((x) => x - 3, 1, 3, 1e-9, 50)).toBe(3);
  });

  it("devolve null quando as pontas têm o mesmo sinal", () => {
    expect(raizPorBissecao((x) => x * x + 1, -1, 1, 1e-9, 50)).toBeNull();
  });

  it("para no limite de iterações com a melhor aproximação", () => {
    const aprox = raizPorBissecao((x) => x - 0.3, 0, 1, 1e-15, 3)!;
    expect(Math.abs(aprox - 0.3)).toBeLessThanOrEqual(0.125);
  });
});

describe("fluxos com datas (XNPV/XIRR)", () => {
  it("XNPV a 9% = 2.086,65 (exemplo do Excel)", () => {
    expect(vplDatado(0.09, EXEMPLO_XIRR).toDecimalPlaces(2).toNumber()).toBe(2086.65);
  });

  it("XIRR = 37,34% (exemplo do Excel)", () => {
    expect(tirDatada(EXEMPLO_XIRR)).toBeCloseTo(0.373362535, 8);
  });

  it("a ordem dos fluxos não importa", () => {
    expect(tirDatada([...EXEMPLO_XIRR].reverse())).toBeCloseTo(0.373362535, 8);
  });

  it("sem intervalo de tempo não há TIR", () => {
    expect(tirDatada([EXEMPLO_XIRR[0]!, { data: dia("2008-01-01"), valor: dec(11000) }])).toBeNull();
    expect(tirDatada([])).toBeNull();
  });

  it("valor futuro: 1.000 a 10% a.a. por 365 dias vira 1.100", () => {
    const vf = valorFuturoDatado(0.1, [{ data: dia("2025-01-01"), valor: dec(1000) }], dia("2026-01-01"));
    expect(vf.toDecimalPlaces(6).toString()).toBe("1100");
  });

  it("valor futuro soma aportes e retiradas, cada um pelo seu prazo", () => {
    const vf = valorFuturoDatado(
      0,
      [
        { data: dia("2025-01-01"), valor: dec(1000) },
        { data: dia("2025-06-01"), valor: dec(-200) },
      ],
      dia("2026-01-01"),
    );
    expect(vf.toString()).toBe("800");
  });
});

describe("payback", () => {
  it("simples: recupera 1.000 entre o 2º e o 3º período, interpolado", () => {
    expect(payback(fluxos(-1000, 300, 400, 500))).toBeCloseTo(2.6, 10);
  });

  it("simples exato num período", () => {
    expect(payback(fluxos(-100, 50, 50, 50))).toBe(2);
  });

  it("nunca recupera: null", () => {
    expect(payback(fluxos(-1000, 100, 100))).toBeNull();
  });

  it("sem investimento: zero", () => {
    expect(payback(fluxos(100, 50))).toBe(0);
  });

  it("descontado demora mais que o simples", () => {
    const f = fluxos(-1000, 300, 400, 500, 200);
    const simples = payback(f)!;
    const descontado = paybackDescontado(0.1, f)!;
    expect(descontado).toBeGreaterThan(simples);
    // Descontados a 10%: 272,73; 330,58; 375,66; 136,60 → acumulado -21,04 no 3º, recupera no 4º.
    expect(descontado).toBeCloseTo(3 + 21.03681 / 136.60269, 4);
  });

  it("descontado que nunca recupera: null", () => {
    expect(paybackDescontado(0.1, fluxos(-1000, 300, 400, 500))).toBeNull();
  });
});
