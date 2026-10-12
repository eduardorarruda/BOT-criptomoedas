import { describe, expect, it } from "vitest";
import { contextoDeCandles } from "./contexto.js";
import { dec } from "./dinheiro.js";
import { decidir, validarEstrategia } from "./estrategia.js";
import { AVISO_MODELOS, MODELOS } from "./modelos.js";
import { POSICAO_ZERADA } from "./posicao.js";

/** 300 candles com tendência, ciclos e volume variando: história suficiente para a SMA 200. */
const ctx = contextoDeCandles(
  Array.from({ length: 300 }, (_, i) => {
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
    expect(new Set(MODELOS.map((m) => m.id)).size).toBe(MODELOS.length);
    expect(MODELOS.length).toBeGreaterThanOrEqual(4);
    for (const m of MODELOS) {
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
