import { describe, expect, it } from "vitest";
import { avaliar } from "./regras.js";
import type { ContextoMercado } from "./contexto.js";
import { faixaDeAbertura, vwapDoDia } from "./indicadores-sessao.js";
import { valorIndicador } from "./catalogo.js";

const MIN = 60_000;
/** Instante UTC de um horário de Brasília (UTC−3). */
const brasilia = (dia: string, hhmm: string) => Date.parse(`${dia}T${hhmm}:00-03:00`);

interface Vela {
  readonly em: number;
  readonly h: number;
  readonly l: number;
  readonly c: number;
  readonly v: number;
}

const ctx = (velas: readonly Vela[], extra: Partial<ContextoMercado> = {}): ContextoMercado => ({
  fechamentos: velas.map((x) => x.c),
  maximas: velas.map((x) => x.h),
  minimas: velas.map((x) => x.l),
  volumes: velas.map((x) => x.v),
  instantes: velas.map((x) => x.em),
  intervaloMs: 5 * MIN,
  ...extra,
});

/** Último candle de ontem, e o pregão de hoje a partir das 10:00 em candles de 5 min. */
const ontem: Vela = { em: brasilia("2026-10-15", "16:55"), h: 999, l: 1, c: 500, v: 1000 };
const hoje = (hhmm: string, h: number, l: number, c: number, v: number): Vela => ({
  em: brasilia("2026-10-16", hhmm),
  h,
  l,
  c,
  v,
});
const dia = [
  ontem,
  hoje("10:00", 103, 97, 100, 10), // típico 100
  hoje("10:05", 106, 100, 104, 30), // típico 103,333…
  hoje("10:10", 110, 104, 108, 20), // típico 107,333…
  hoje("10:15", 109, 101, 102, 40), // típico 104
];

describe("VWAP do dia (reinicia no começo de cada dia de Brasília)", () => {
  it("Σ preço típico × volume ÷ Σ volume, só com os candles de hoje (feito à mão)", () => {
    // (100×10 + 310/3×30 + 322/3×20 + 104×40) / 100 = (1000 + 3100 + 2146,67 + 4160) / 100
    const esperado = (1000 + (310 / 3) * 30 + (322 / 3) * 20 + 104 * 40) / 100;
    expect(vwapDoDia(ctx(dia), 0)).toBeCloseTo(esperado, 10);
    // um candle atrás: sem o das 10:15
    const antes = (1000 + (310 / 3) * 30 + (322 / 3) * 20) / 60;
    expect(vwapDoDia(ctx(dia), 1)).toBeCloseTo(antes, 10);
    // no primeiro candle do dia, é o típico dele: o de ontem não entra
    expect(vwapDoDia(ctx(dia), 3)).toBeCloseTo(100, 10);
  });

  it("sem volume (índice sem negócios) ou sem instantes: dados insuficientes", () => {
    const semVolume = ctx(dia.map((x) => ({ ...x, v: 0 })));
    expect(vwapDoDia(semVolume, 0)).toBeNull();
    const { instantes: _i, ...semInstantes } = ctx(dia);
    expect(vwapDoDia(semInstantes, 0)).toBeNull();
    const { volumes: _v, ...semVolumes } = ctx(dia);
    expect(vwapDoDia(semVolumes, 0)).toBeNull();
  });

  it("o começo do dia fora do histórico: não inventa (dados insuficientes)", () => {
    expect(vwapDoDia(ctx(dia.slice(1)), 0)).toBeNull();
  });

  it("sem máxima e mínima, usa o fechamento", () => {
    const { maximas: _h, minimas: _l, ...soFechamento } = ctx(dia);
    const esperado = (100 * 10 + 104 * 30 + 108 * 20 + 102 * 40) / 100;
    expect(vwapDoDia(soFechamento, 0)).toBeCloseTo(esperado, 10);
  });
});

describe("faixa de abertura (máxima e mínima dos primeiros N minutos do dia)", () => {
  it("15 minutos: só existe depois que o candle das 10:10 fecha (10:15)", () => {
    const c = ctx(dia);
    expect(faixaDeAbertura(c, 15, 0)).toEqual({ superior: 110, inferior: 97, meio: 103.5 });
    // no fechamento das 10:10 já fechou a janela (10:00 + 15 min)
    expect(faixaDeAbertura(c, 15, 1)).toEqual({ superior: 110, inferior: 97, meio: 103.5 });
    // no fechamento das 10:05, ainda não: não olha adiante
    expect(faixaDeAbertura(c, 15, 2)).toBeNull();
  });

  it("10 minutos: os dois primeiros candles; o candle das 10:15 não muda a faixa", () => {
    expect(faixaDeAbertura(ctx(dia), 10, 0)).toEqual({ superior: 106, inferior: 97, meio: 101.5 });
  });

  it("propriedade: o valor de um candle não muda quando chegam candles depois (sem olhar adiante)", () => {
    const longo = [...dia, hoje("10:20", 200, 50, 120, 5), hoje("10:25", 300, 10, 130, 5)];
    for (let k = 2; k <= longo.length; k++) {
      const curto = ctx(longo.slice(0, k));
      const cheio = ctx(longo);
      const desloc = longo.length - k;
      expect(faixaDeAbertura(cheio, 15, desloc)).toEqual(faixaDeAbertura(curto, 15, 0));
      expect(vwapDoDia(cheio, desloc)).toEqual(vwapDoDia(curto, 0));
    }
  });

  it("sem o intervalo informado, deduz dos instantes; sem máxima/mínima ou instantes, nada", () => {
    const { intervaloMs: _d, ...semDuracao } = ctx(dia);
    expect(faixaDeAbertura(semDuracao, 15, 0)).toEqual({ superior: 110, inferior: 97, meio: 103.5 });
    const { maximas: _h, ...semMaxima } = ctx(dia);
    expect(faixaDeAbertura(semMaxima, 15, 0)).toBeNull();
    const { instantes: _i, ...semInstantes } = ctx(dia);
    expect(faixaDeAbertura(semInstantes, 15, 0)).toBeNull();
    expect(faixaDeAbertura(ctx(dia.slice(1)), 15, 0)).toBeNull();
  });
});

describe("no catálogo e nas regras", () => {
  it("o rompimento do topo da faixa de abertura vira regra", () => {
    const c = ctx([...dia, hoje("10:20", 115, 108, 112, 10)]);
    const r = avaliar(
      {
        tipo: "comparar",
        esquerda: { tipo: "preco" },
        comparador: "cruzouAcima",
        direita: { tipo: "indicador", nome: "faixaAbertura", periodo: 15, saida: "superior" },
      },
      c,
    );
    expect(r.valor).toBe(true);
    expect(r.explicacao).toBe("preço (112) cruzou acima de topo da faixa de abertura(15 min) (110): sim");
    expect(valorIndicador({ tipo: "indicador", nome: "vwap" }, c, 0)).not.toBeNull();
    expect(
      valorIndicador({ tipo: "indicador", nome: "faixaAbertura", periodo: 15, saida: "meio" }, c, 0),
    ).toBe(103.5);
  });
});
