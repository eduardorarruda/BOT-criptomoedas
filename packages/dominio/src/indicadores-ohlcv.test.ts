import { describe, expect, it } from "vitest";
import { adx, estocastico, macd, momento, roc } from "./momento.js";
import { atr, bollinger, donchian } from "./volatilidade.js";
import { volumeMedio, volumeRelativo } from "./volume.js";

/**
 * Série de referência: os 42 fechamentos do exemplo de Bandas de Bollinger da
 * StockCharts ChartSchool ("Bollinger Bands", planilha cs-bollinger), com máxima,
 * mínima e volume sintéticos e determinísticos:
 *   máxima_i = fechamento_i + 0,5 + 0,25 × (i mod 3)
 *   mínima_i = fechamento_i − 0,4 − 0,2 × (i mod 4)
 *   volume_i = 1000 + (137 × i mod 500)
 *
 * Os valores esperados de ATR, ADX, MACD, estocástico, Donchian, ROC e volume
 * relativo vêm de uma implementação de referência independente, em Python com
 * frações exatas (`fractions.Fraction`), escrita direto das definições publicadas:
 * Wilder, "New Concepts in Technical Trading Systems" (1978) para TR, ATR, ±DM,
 * ±DI, DX e ADX (convenção do TA-Lib: o primeiro ATR é a média simples dos
 * primeiros N TR; o primeiro ADX, a média dos primeiros N DX); Appel para o MACD;
 * Lane para o estocástico. A suavização de Wilder em si é conferida contra o
 * exemplo publicado de RSI da StockCharts (em indicadores.test.ts).
 */
const fechamentos = [
  86.16, 89.09, 88.78, 90.32, 89.07, 91.15, 89.44, 89.18, 86.93, 87.68, 86.96, 89.43, 89.32, 88.72, 87.45,
  87.26, 89.5, 87.9, 89.13, 90.7, 92.9, 92.98, 91.8, 92.66, 92.68, 92.3, 92.77, 92.54, 92.95, 93.2, 91.07,
  89.83, 89.74, 90.4, 90.74, 88.02, 88.09, 88.84, 90.78, 90.54, 91.39, 90.65,
];
const maximas = fechamentos.map((c, i) => c + 0.5 + 0.25 * (i % 3));
const minimas = fechamentos.map((c, i) => c - 0.4 - 0.2 * (i % 4));
const volumes = fechamentos.map((_, i) => 1000 + ((137 * i) % 500));
const velas = { maximas, minimas, fechamentos };

/** Corta a série no candle `fim` (inclusive): o que se sabia naquele momento. */
const ate = (fim: number) => ({
  maximas: maximas.slice(0, fim + 1),
  minimas: minimas.slice(0, fim + 1),
  fechamentos: fechamentos.slice(0, fim + 1),
});

/** Gerador pseudoaleatório com semente (mulberry32): testes de propriedade reproduzíveis. */
function aleatorio(semente: number): () => number {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function serieAleatoria(semente: number, n: number) {
  const r = aleatorio(semente);
  let preco = 100;
  const s = {
    maximas: [] as number[],
    minimas: [] as number[],
    fechamentos: [] as number[],
    volumes: [] as number[],
  };
  for (let i = 0; i < n; i++) {
    preco *= 1 + (r() - 0.5) * 0.04;
    s.fechamentos.push(preco);
    s.maximas.push(preco * (1 + r() * 0.01));
    s.minimas.push(preco * (1 - r() * 0.01));
    s.volumes.push(100 + r() * 900);
  }
  return s;
}

describe("ATR (Wilder)", () => {
  it("bate com a referência: primeiro valor, meio e fim da série", () => {
    expect(atr(ate(14), 14)).toBeCloseTo(2.125, 10);
    expect(atr(ate(20), 14)).toBeCloseTo(2.2097968752656207, 10);
    expect(atr(velas, 14)).toBeCloseTo(1.8699294160105484, 10);
  });

  it("precisa de N + 1 candles (o TR usa o fechamento anterior)", () => {
    expect(atr(ate(13), 14)).toBeNull();
    expect(atr(velas, 14, 28)).toBeNull();
    expect(atr(velas, 14, 27)).toBeCloseTo(2.125, 10);
  });

  it("recusa séries de tamanhos diferentes e período inválido", () => {
    expect(() => atr({ ...velas, maximas: maximas.slice(1) }, 14)).toThrow(/tamanho/);
    expect(() => atr(velas, 0)).toThrow(/período/);
  });
});

describe("Bandas de Bollinger", () => {
  // StockCharts ChartSchool, "Bollinger Bands": média de 20, 2 desvios-padrão
  // (populacionais), valores publicados com 2 casas a partir do 20º fechamento.
  const publicados: readonly [number, number, number, number][] = [
    [19, 88.71, 91.29, 86.12],
    [20, 89.05, 91.95, 86.14],
    [21, 89.24, 92.61, 85.87],
    [22, 89.39, 92.93, 85.85],
    [23, 89.51, 93.31, 85.7],
    [24, 89.69, 93.73, 85.65],
    [25, 89.75, 93.9, 85.59],
  ];

  it.each(publicados)("candle %i: média %f, superior %f, inferior %f", (fim, media, superior, inferior) => {
    const b = bollinger(fechamentos.slice(0, fim + 1), 20, 2);
    expect(b).not.toBeNull();
    expect(Math.abs(b!.media - media)).toBeLessThan(0.006);
    expect(Math.abs(b!.superior - superior)).toBeLessThan(0.006);
    expect(Math.abs(b!.inferior - inferior)).toBeLessThan(0.006);
  });

  it("%B e largura saem das bandas", () => {
    const b = bollinger(fechamentos, 20, 2)!;
    expect(b.percentualB).toBeCloseTo((90.65 - b.inferior) / (b.superior - b.inferior), 12);
    expect(b.largura).toBeCloseTo((b.superior - b.inferior) / b.media, 12);
  });

  it("série parada: bandas coladas, %B no meio (0,5) e largura zero", () => {
    const b = bollinger(Array<number>(20).fill(10), 20, 2)!;
    expect(b).toEqual({ media: 10, superior: 10, inferior: 10, percentualB: 0.5, largura: 0 });
  });

  it("dados insuficientes e deslocamento", () => {
    expect(bollinger(fechamentos.slice(0, 19), 20, 2)).toBeNull();
    expect(bollinger(fechamentos, 20, 2, 1)).toEqual(bollinger(fechamentos.slice(0, -1), 20, 2));
    expect(() => bollinger(fechamentos, 20, 0)).toThrow(/desvios/);
  });
});

describe("Canal de Donchian (sem o candle atual)", () => {
  it("máxima e mínima dos N candles ANTERIORES ao último", () => {
    const d = donchian(velas, 20)!;
    expect(d.superior).toBeCloseTo(94.2, 10);
    expect(d.inferior).toBeCloseTo(87.02, 10);
    expect(d.meio).toBeCloseTo((94.2 + 87.02) / 2, 10);
  });

  it("sem olhar adiante: mexer no candle atual não muda o canal", () => {
    const antes = donchian(velas, 20);
    const rompeu = {
      ...velas,
      maximas: [...maximas.slice(0, -1), 999],
      minimas: [...minimas.slice(0, -1), 1],
    };
    expect(donchian(rompeu, 20)).toEqual(antes);
  });

  it("precisa de N + 1 candles", () => {
    expect(donchian(ate(19), 20)).toBeNull();
    expect(donchian(ate(20), 20)).not.toBeNull();
  });
});

describe("MACD (Appel)", () => {
  it("linha, sinal e histograma batem com a referência", () => {
    const m = macd(fechamentos, 12, 26, 9)!;
    expect(m.macd).toBeCloseTo(0.1948338952700613, 10);
    expect(m.sinal).toBeCloseTo(0.3664699479567382, 10);
    expect(m.histograma).toBeCloseTo(-0.17163605268667687, 10);
    const antes = macd(fechamentos, 12, 26, 9, 1)!;
    expect(antes.macd).toBeCloseTo(0.18683448790518686, 10);
    expect(antes.histograma).toBeCloseTo(-0.22254447322322055, 10);
  });

  it("precisa de lenta + sinal − 1 candles; a rápida precisa ser menor que a lenta", () => {
    expect(macd(fechamentos.slice(0, 33), 12, 26, 9)).toBeNull();
    expect(macd(fechamentos.slice(0, 34), 12, 26, 9)).not.toBeNull();
    expect(() => macd(fechamentos, 26, 12, 9)).toThrow(/rápida/);
  });
});

describe("Estocástico (Lane)", () => {
  it("%K e %D batem com a referência", () => {
    const e = estocastico(velas, 14, 3)!;
    expect(e.k).toBeCloseTo(50.55710306406685, 10);
    expect(e.d).toBeCloseTo(53.48189415041783, 10);
  });

  it("faixa parada dá 50; faltando candles dá null", () => {
    const parado = {
      maximas: Array<number>(16).fill(5),
      minimas: Array<number>(16).fill(5),
      fechamentos: Array<number>(16).fill(5),
    };
    expect(estocastico(parado, 14, 3)).toEqual({ k: 50, d: 50 });
    expect(estocastico(ate(14), 14, 3)).toBeNull();
    expect(estocastico(ate(15), 14, 3)).not.toBeNull();
  });
});

describe("ROC e momento", () => {
  it("variação percentual e diferença contra N candles atrás", () => {
    expect(roc(fechamentos, 10)).toBeCloseTo(0.9128353556718246, 10);
    expect(momento(fechamentos, 10)).toBeCloseTo(90.65 - 89.83, 10);
    expect(roc(fechamentos.slice(0, 10), 10)).toBeNull();
    expect(momento([1, 2], 1, 1)).toBeNull();
    expect(roc([0, 1], 1)).toBeNull();
  });
});

describe("volume", () => {
  it("volume médio é a média simples dos últimos N volumes", () => {
    expect(volumeMedio(volumes, 3)).toBeCloseTo((1343 + 1480 + 1117) / 3, 10);
    expect(volumeMedio(volumes.slice(0, 2), 3)).toBeNull();
  });

  it("volume relativo: o último contra a média dos N anteriores (sem ele)", () => {
    expect(volumeRelativo(volumes, 20)).toBeCloseTo(0.8911049062624651, 10);
    expect(volumeRelativo(volumes.slice(0, 20), 20)).toBeNull();
    expect(volumeRelativo([0, 0, 5], 2)).toBeNull();
  });
});

describe("ADX (Wilder)", () => {
  it("ADX, +DI e −DI batem com a referência no primeiro ADX e no fim", () => {
    const primeiro = adx(ate(27), 14)!;
    expect(primeiro.adx).toBeCloseTo(17.309551691707426, 9);
    expect(primeiro.maisDI).toBeCloseTo(33.54552162201083, 9);
    expect(primeiro.menosDI).toBeCloseTo(22.83252654529012, 9);
    const fim = adx(velas, 14)!;
    expect(fim.adx).toBeCloseTo(11.70498280001424, 9);
    expect(fim.maisDI).toBeCloseTo(29.45255957978786, 9);
    expect(fim.menosDI).toBeCloseTo(27.104148783314344, 9);
  });

  it("precisa de 2N candles", () => {
    expect(adx(ate(26), 14)).toBeNull();
  });

  it("sem movimento direcional nenhum: DI e ADX zerados", () => {
    const n = 10;
    const parado = {
      maximas: Array<number>(n).fill(2),
      minimas: Array<number>(n).fill(1),
      fechamentos: Array<number>(n).fill(1.5),
    };
    expect(adx(parado, 3)).toEqual({ adx: 0, maisDI: 0, menosDI: 0 });
  });
});

describe("sem olhar adiante (propriedade, séries aleatórias com semente)", () => {
  // Um indicador no candle t só pode depender dos candles até t. Então: calcular com
  // deslocamento 1 sobre a série inteira tem de dar o mesmo que calcular sobre a série
  // sem o último candle — e trocar o último candle não pode mudar o valor anterior.
  const calculos: Record<string, (s: ReturnType<typeof serieAleatoria>, d: number) => unknown> = {
    atr: (s, d) => atr(s, 14, d),
    bollinger: (s, d) => bollinger(s.fechamentos, 20, 2, d),
    donchian: (s, d) => donchian(s, 20, d),
    macd: (s, d) => macd(s.fechamentos, 12, 26, 9, d),
    estocastico: (s, d) => estocastico(s, 14, 3, d),
    adx: (s, d) => adx(s, 14, d),
    roc: (s, d) => roc(s.fechamentos, 10, d),
    momento: (s, d) => momento(s.fechamentos, 10, d),
    volumeMedio: (s, d) => volumeMedio(s.volumes, 20, d),
    volumeRelativo: (s, d) => volumeRelativo(s.volumes, 20, d),
  };

  it.each(Object.keys(calculos))("%s", (nome) => {
    const calcular = calculos[nome]!;
    for (let semente = 1; semente <= 25; semente++) {
      const s = serieAleatoria(semente, 80);
      const semUltimo = {
        maximas: s.maximas.slice(0, -1),
        minimas: s.minimas.slice(0, -1),
        fechamentos: s.fechamentos.slice(0, -1),
        volumes: s.volumes.slice(0, -1),
      };
      const outroFuturo = {
        maximas: [...semUltimo.maximas, 1e6],
        minimas: [...semUltimo.minimas, 1e-6],
        fechamentos: [...semUltimo.fechamentos, 5e5],
        volumes: [...semUltimo.volumes, 1e9],
      };
      const antes = calcular(semUltimo, 0);
      expect(antes).not.toBeNull();
      expect(calcular(s, 1)).toEqual(antes);
      expect(calcular(outroFuturo, 1)).toEqual(antes);
    }
  });
});
