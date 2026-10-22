import { describe, expect, it } from "vitest";
import { contextoDeCandles } from "./contexto.js";
import { dec } from "./dinheiro.js";
import { decidir, decidirComSentido, validarEstrategia } from "./estrategia.js";
import { problemasNoMercado } from "./mercados/mercado.js";
import { AVISO_MODELOS, MODELOS, MODELOS_WIN, TODOS_OS_MODELOS } from "./modelos.js";
import { POSICAO_ZERADA, type Posicao } from "./posicao.js";

/** 450 candles com tendência, ciclos e volume variando: história suficiente para a SMA 400 do cofre. */
const ctx = contextoDeCandles(
  Array.from({ length: 450 }, (_, i) => {
    const fecha = 100 + i * 0.2 + 8 * Math.sin(i / 9);
    return {
      abertura: i,
      fechamento: i + 1,
      abre: dec(fecha - 0.3),
      maxima: dec(fecha + 1.2),
      minima: dec(fecha - 1.1),
      fecha: dec(fecha),
      volume: dec(100 + ((i * 37) % 90)),
    };
  }),
);

describe("modelos de estratégia (exemplos)", () => {
  it("têm ids únicos, nome e um parágrafo de descrição", () => {
    expect(new Set(TODOS_OS_MODELOS.map((m) => m.id)).size).toBe(TODOS_OS_MODELOS.length);
    expect(MODELOS.length).toBeGreaterThanOrEqual(4);
    for (const m of TODOS_OS_MODELOS) {
      expect(m.nome.length).toBeGreaterThan(5);
      expect(m.descricao.length).toBeGreaterThan(200);
      expect(m.descricao).not.toMatch(/\n/);
    }
    expect(AVISO_MODELOS).toMatch(/não é recomendação/i);
  });

  it.each(MODELOS.map((m) => [m.id, m] as const))("%s passa nas validações do domínio e decide", (_, m) => {
    expect(validarEstrategia(m.estrategia)).toEqual([]);
    const s = decidir(m.estrategia, { ...ctx, preco: dec(ctx.fechamentos.at(-1)!) }, POSICAO_ZERADA);
    expect(s.explicacao).not.toMatch(/dados insuficientes/);
  });
});

/**
 * Três pregões de candles de 5 minutos (10:00–16:55 de Brasília), com tendência,
 * ciclos e volume: o que os modelos do mini índice veem no backtest.
 */
const pregoes = contextoDeCandles(
  ["2026-10-14", "2026-10-15", "2026-10-16"].flatMap((dia, d) =>
    Array.from({ length: 84 }, (_, i) => {
      const k = d * 84 + i;
      const fecha = 130_000 + k * 3 + 400 * Math.sin(k / 7);
      const abertura = Date.parse(`${dia}T10:00:00-03:00`) + i * 300_000;
      return {
        abertura,
        fechamento: abertura + 299_999,
        abre: dec(fecha - 20),
        maxima: dec(fecha + 60),
        minima: dec(fecha - 55),
        fecha: dec(fecha),
        volume: dec(1000 + ((k * 37) % 900)),
      };
    }),
  ),
);

describe("modelos do mini índice (WIN)", () => {
  it("são do WIN em 5 minutos, nos dois sentidos ou só comprados, sem taxa (os custos vêm do mercado)", () => {
    expect(MODELOS_WIN.length).toBeGreaterThanOrEqual(3);
    for (const m of MODELOS_WIN) {
      expect(m).toMatchObject({ mercado: "win", intervalo: "5m" });
      expect([undefined, "comprado", "ambos"]).toContain(m.estrategia.direcao);
      expect(m.estrategia.taxa).toBe(0);
      expect(problemasNoMercado(m.estrategia, "win")).toEqual([]);
      // só os que vendem a descoberto ficam de fora do cripto (à vista, só comprado)
      expect(problemasNoMercado(m.estrategia, "cripto")).toHaveLength(
        m.estrategia.direcao === "ambos" ? 1 : 0,
      );
      expect(m.descricao).not.toMatch(/recomend/i);
    }
    // os de cripto continuam só comprados
    for (const m of MODELOS) expect(problemasNoMercado(m.estrategia, "cripto")).toEqual([]);
  });

  it.each(MODELOS_WIN.map((m) => [m.id, m] as const))("%s passa nas validações e decide", (_, m) => {
    expect(validarEstrategia(m.estrategia)).toEqual([]);
    const s = decidirComSentido(m.estrategia, { ...pregoes, preco: dec(pregoes.fechamentos.at(-1)!) }, null);
    expect(s.explicacao).not.toMatch(/dados insuficientes/);
  });
});

const HORA_4H = 14_400_000;

/**
 * 410 candles de 4h terminando num candle que abre às `horaUtcFinal` (UTC) do dia 2026-10-20: o
 * preço fica acima ou abaixo da SMA 400 conforme o último fechamento.
 */
function velas4h(horaUtcFinal: number, ultimo: number) {
  const fimAbertura = Date.parse("2026-10-20T00:00:00Z") + horaUtcFinal * 3_600_000;
  return contextoDeCandles(
    Array.from({ length: 410 }, (_, i) => {
      const abertura = fimAbertura - (409 - i) * HORA_4H;
      const fecha = i === 409 ? ultimo : 100;
      return {
        abertura,
        fechamento: abertura + HORA_4H - 1,
        abre: dec(100),
        maxima: dec(Math.max(fecha, 100) + 1),
        minima: dec(Math.min(fecha, 100) - 1),
        fecha: dec(fecha),
        volume: dec(10),
      };
    }),
  );
}

describe("cofre de tendência (SMA 400, uma decisão por dia)", () => {
  const cofre = MODELOS.find((m) => m.id === "cofre-tendencia-sma400")!;
  const comprado: Posicao = { ...POSICAO_ZERADA, quantidade: dec(1), precoMedio: dec(100) };

  it("é um modelo de cripto em 4h, só comprado, com tamanho por alocação e stop de catástrofe", () => {
    expect(cofre).toBeDefined();
    expect(cofre.intervalo).toBe("4h");
    expect(cofre.mercado).toBeUndefined();
    expect(cofre.nome.length).toBeLessThanOrEqual(80);
    expect(cofre.estrategia).toMatchObject({
      stop: 0.49,
      alvoLiquido: 0.99,
      taxa: 0.001,
      tamanhoPorAlocacao: { fracao: 1 },
    });
    expect(cofre.estrategia.tamanhoPorVolatilidade).toBeUndefined();
    expect(validarEstrategia(cofre.estrategia)).toEqual([]);
    expect(problemasNoMercado(cofre.estrategia, "cripto")).toEqual([]);
  });

  it("a descrição é neutra: traz os números do estudo, os limites e que é teste", () => {
    expect(cofre.descricao).not.toMatch(/recomend/i);
    expect(cofre.descricao).not.toMatch(/\n/);
    for (const trecho of ["1.348%", "−67%", "886%", "−87%", "viés de sobrevivência", "teste"])
      expect(cofre.descricao).toContain(trecho);
  });

  it("compra só na vela que abre às 17:00 de Brasília (20:00 UTC), e só acima da SMA 400", () => {
    const acima = (h: number) => ({ ...velas4h(h, 130), preco: dec(130) });
    expect(decidir(cofre.estrategia, acima(20), POSICAO_ZERADA)).toMatchObject({ acao: "COMPRAR" });
    expect(decidir(cofre.estrategia, acima(16), POSICAO_ZERADA).acao).toBe("AGUARDAR");
    expect(decidir(cofre.estrategia, acima(0), POSICAO_ZERADA).acao).toBe("AGUARDAR");
    const abaixo = { ...velas4h(20, 70), preco: dec(70) };
    expect(decidir(cofre.estrategia, abaixo, POSICAO_ZERADA).acao).toBe("AGUARDAR");
  });

  it("sai só no mesmo horário e só abaixo da SMA 400 (o stop de 49% e o alvo de 99% ficam longe)", () => {
    const abaixo = (h: number) => ({ ...velas4h(h, 70), preco: dec(70) });
    expect(decidir(cofre.estrategia, abaixo(20), comprado)).toMatchObject({
      acao: "VENDER",
      motivo: "regra de saída",
    });
    expect(decidir(cofre.estrategia, abaixo(12), comprado).acao).toBe("AGUARDAR");
    const acima = { ...velas4h(20, 130), preco: dec(130) };
    expect(decidir(cofre.estrategia, acima, comprado).acao).toBe("AGUARDAR");
  });
});
