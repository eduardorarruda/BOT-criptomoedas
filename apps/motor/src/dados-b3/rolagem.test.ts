import { describe, expect, it } from "vitest";
import type { BarraMil, ContratoNoDia, DiaDeNegocios } from "./negocios-dia.js";
import { contratoDoDia, montarSerie } from "./rolagem.js";

const M5 = 300_000;
const nove = (dia: number) => Date.UTC(2026, 9, dia, 12, 0);

/** Barra das 09:00 de Brasília no dia, com preços em pontos. */
function barra(dia: number, abre: number, fecha: number, volume = 10): BarraMil {
  return {
    abertura: nove(dia),
    abreMil: abre * 1000,
    maximaMil: Math.max(abre, fecha) * 1000,
    minimaMil: Math.min(abre, fecha) * 1000,
    fechaMil: fecha * 1000,
    volume,
    negocios: 3,
  };
}

function contrato(instrumento: string, quantidade: number, barras: BarraMil[]): ContratoNoDia {
  return {
    instrumento,
    negocios: barras.length,
    quantidade,
    barras,
    negociosNoPregao: barras.length,
    negociosForaDoPregao: 0,
    ultimoMil: barras.at(-1)?.fechaMil ?? 0,
  };
}

const dia = (n: number, contratos: ContratoNoDia[]): DiaDeNegocios => ({
  data: `2026-10-${n}`,
  contratos: [...contratos].sort((a, b) => b.quantidade - a.quantidade),
});

// 13: WINV26 cheio (fecha 200.500), WINZ26 fecha 202.400; 14: WINZ26 cheio.
const DIAS = [
  dia(13, [
    contrato("WINV26", 56, [barra(13, 200_000, 200_500)]),
    contrato("WINZ26", 5, [barra(13, 202_000, 202_400)]),
  ]),
  dia(14, [
    contrato("WINZ26", 32, [barra(14, 202_500, 202_700)]),
    contrato("WINV26", 9, [barra(14, 200_700, 200_800)]),
  ]),
];

describe("contrato do dia", () => {
  it("é o de maior quantidade negociada", () => {
    expect(contratoDoDia(DIAS[0]!)?.instrumento).toBe("WINV26");
    expect(contratoDoDia(DIAS[1]!)?.instrumento).toBe("WINZ26");
    expect(contratoDoDia({ data: "2026-10-15", contratos: [] })).toBeUndefined();
  });
});

describe("série do WIN com rolagem", () => {
  it("sem ajuste: cada dia com os preços do próprio contrato, e a rolagem registrada", () => {
    const s = montarSerie(DIAS, "nenhum");
    expect(s.dias.map((d) => [d.data, d.contrato.instrumento, d.deslocamentoMil])).toEqual([
      ["2026-10-13", "WINV26", 0],
      ["2026-10-14", "WINZ26", 0],
    ]);
    expect(s.rolagens).toEqual([
      { data: "2026-10-14", de: "WINV26", para: "WINZ26", diferencaMil: 1_900_000, referencia: "2026-10-13" },
    ]);
    const [k] = s.dias[0]!.candles;
    expect(k).toMatchObject({ abertura: nove(13), fechamento: nove(13) + M5 - 1 });
    expect([k!.abre, k!.maxima, k!.minima, k!.fecha, k!.volume].map(String)).toEqual([
      "200000",
      "200500",
      "200000",
      "200500",
      "10",
    ]);
  });

  it("ajuste por diferença: os dias antes da rolagem andam a diferença; o contrato atual fica como está", () => {
    const s = montarSerie(DIAS, "diferenca");
    expect(s.dias.map((d) => d.deslocamentoMil)).toEqual([1_900_000, 0]);
    expect(String(s.dias[0]!.candles[0]!.abre)).toBe("201900");
    expect(String(s.dias[0]!.candles[0]!.fecha)).toBe("202400");
    expect(String(s.dias[0]!.candles[0]!.volume)).toBe("10");
    expect(String(s.dias[1]!.candles[0]!.abre)).toBe("202500");
  });

  it("duas rolagens somam as diferenças para trás", () => {
    const dias = [
      ...DIAS,
      dia(15, [
        contrato("WINZ26", 30, [barra(15, 202_800, 203_000)]),
        contrato("WING27", 3, [barra(15, 206_000, 206_100)]),
      ]),
      dia(16, [contrato("WING27", 40, [barra(16, 206_200, 206_300)])]),
    ];
    const s = montarSerie(dias, "diferenca");
    // 14→15 sem rolagem; 15→16: G27 − Z26 no dia 15 = 206.100 − 203.000 = 3.100.
    expect(s.rolagens.map((r) => [r.data, r.diferencaMil])).toEqual([
      ["2026-10-14", 1_900_000],
      ["2026-10-16", 3_100_000],
    ]);
    expect(s.dias.map((d) => d.deslocamentoMil)).toEqual([5_000_000, 3_100_000, 3_100_000, 0]);
  });

  it("sem o contrato novo no dia anterior, usa os fechamentos do dia da rolagem", () => {
    const dias = [
      dia(13, [contrato("WINV26", 56, [barra(13, 200_000, 200_500)])]),
      dia(14, DIAS[1]!.contratos as ContratoNoDia[]),
    ];
    const s = montarSerie(dias, "diferenca");
    // 202.700 − 200.800 = 1.900, nos fechamentos do dia 14.
    expect(s.rolagens).toEqual([
      { data: "2026-10-14", de: "WINV26", para: "WINZ26", diferencaMil: 1_900_000, referencia: "2026-10-14" },
    ]);
    expect(s.dias[0]!.deslocamentoMil).toBe(1_900_000);
  });

  it("sem os dois contratos num mesmo dia, a diferença fica desconhecida e nada é deslocado", () => {
    const dias = [
      dia(13, [contrato("WINV26", 56, [barra(13, 200_000, 200_500)])]),
      dia(14, [contrato("WINZ26", 32, [barra(14, 202_500, 202_700)])]),
    ];
    const s = montarSerie(dias, "diferenca");
    expect(s.rolagens[0]?.diferencaMil).toBeNull();
    expect(s.rolagens[0]?.referencia).toBeNull();
    expect(s.dias.map((d) => d.deslocamentoMil)).toEqual([0, 0]);
  });

  it("dia sem nenhum negócio de WIN fica de fora", () => {
    const s = montarSerie([...DIAS, { data: "2026-10-15", contratos: [] }], "nenhum");
    expect(s.dias.map((d) => d.data)).toEqual(["2026-10-13", "2026-10-14"]);
  });
});
