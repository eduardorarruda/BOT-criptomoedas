import { describe, expect, it } from "vitest";
import { dec } from "../dinheiro.js";
import type { Estrategia } from "../estrategia.js";
import { CUSTOS_WIN_PADRAO, SESSAO_B3_PADRAO } from "../mercados/index.js";
import type { Regra } from "../regras.js";
import type { Candle } from "../tipos.js";
import { simularDesfecho, type CustosDesfecho, type PedidoDesfecho } from "./desfecho.js";

const MIN5 = 300_000;
const T0 = Date.UTC(2026, 9, 13, 13, 0); // 10h00 de Brasília

/** Candle de 5 minutos número `i` a partir de T0. */
const vela = (i: number, o: number, h: number, l: number, c: number, inicio = T0): Candle => ({
  abertura: inicio + i * MIN5,
  fechamento: inicio + (i + 1) * MIN5 - 1,
  abre: dec(o),
  maxima: dec(h),
  minima: dec(l),
  fecha: dec(c),
  volume: dec(1),
});
const parada = (i: number, p: number, inicio = T0) => vela(i, p, p, p, p, inicio);

const sempre: Regra = {
  tipo: "comparar",
  esquerda: { tipo: "preco" },
  comparador: ">",
  direita: { tipo: "numero", valor: 0 },
};
const base: Estrategia = { entrada: sempre, stop: 0.02, alvoLiquido: 0.03, taxa: 0 };
const semCustos: CustosDesfecho = { mercado: "cripto", taxaPorLado: 0, bpsContra: 0 };

/** Decisão no fechamento do candle 0 (preço 100), candles seguintes a partir do 1. */
const pedido = (depois: readonly Candle[], extra: Partial<PedidoDesfecho> = {}): PedidoDesfecho => ({
  estrategia: base,
  sentido: "comprado",
  preco: dec(100),
  quantidade: dec(1),
  custos: semCustos,
  antes: [parada(0, 100)],
  depois,
  horizonte: 50,
  ...extra,
});

describe("desfecho contrafactual no cripto (comprado)", () => {
  it("stop tocado pela mínima: sai no stop, resultado = queda até o stop", () => {
    const d = simularDesfecho(pedido([parada(1, 100), vela(2, 100, 100.5, 97, 98.5)]));
    expect(d).toMatchObject({ situacao: "concluido", motivo: "stop", barras: 2, ambiguo: false });
    if (d.situacao !== "concluido") throw new Error("esperava concluído");
    expect(d.saida.toString()).toBe("98");
    expect(d.resultado.toString()).toBe("-2");
    expect(d.retorno).toBeCloseTo(-0.02, 12);
    expect(d.em).toBe(T0 + 3 * MIN5 - 1);
  });

  it("alvo com a taxa da corretora: sobra exatamente o alvo líquido sobre o custo da entrada", () => {
    const comTaxa = { ...base, taxa: 0.001 };
    const custos: CustosDesfecho = { mercado: "cripto", taxaPorLado: 0.001, bpsContra: 0 };
    const d = simularDesfecho(pedido([vela(1, 100, 104, 99.5, 103)], { estrategia: comTaxa, custos }));
    expect(d).toMatchObject({ situacao: "concluido", motivo: "alvo", barras: 1 });
    if (d.situacao !== "concluido") throw new Error("esperava concluído");
    // alvo = 100 × 1,001 × 1,03 ÷ 0,999; lucro = alvo × 0,999 − 100 × 1,001 = 100 × 1,001 × 0,03
    expect(d.resultado.toNumber()).toBeCloseTo(3.003, 10);
  });

  it("stop com taxa e deslizamento: as duas pontas pagam", () => {
    const custos: CustosDesfecho = { mercado: "cripto", taxaPorLado: 0.001, bpsContra: 10 };
    const d = simularDesfecho(pedido([vela(1, 100, 100, 90, 95)], { custos, quantidade: dec(2) }));
    if (d.situacao !== "concluido") throw new Error("esperava concluído");
    // entrada 100 × 1,001 = 100,1; stop 2% dela = 98,098; venda executa 98,098 × 0,999
    const entrada = 100.1;
    const stop = entrada * 0.98;
    const saida = stop * 0.999;
    const esperado = 2 * (saida - entrada) - 0.001 * 2 * (entrada + saida);
    expect(d.entrada.toNumber()).toBeCloseTo(entrada, 10);
    expect(d.saida.toNumber()).toBeCloseTo(saida, 10);
    expect(d.resultado.toNumber()).toBeCloseTo(esperado, 10);
  });

  it("abre abaixo do stop (salto): sai na abertura, pior que o stop", () => {
    const d = simularDesfecho(pedido([vela(1, 95, 96, 94, 95.5)]));
    expect(d).toMatchObject({ situacao: "concluido", motivo: "stop", barras: 1 });
    if (d.situacao !== "concluido") throw new Error("esperava concluído");
    expect(d.resultado.toString()).toBe("-5");
  });

  it("stop e alvo no mesmo candle: conta o stop e marca ambíguo", () => {
    const d = simularDesfecho(pedido([vela(1, 100, 104, 97, 103)]));
    expect(d).toMatchObject({ situacao: "concluido", motivo: "stop", ambiguo: true });
  });

  it("regra de saída no fechamento", () => {
    const saida: Regra = {
      tipo: "comparar",
      esquerda: { tipo: "preco" },
      comparador: "<",
      direita: { tipo: "numero", valor: 99.5 },
    };
    const d = simularDesfecho(
      pedido([parada(1, 100), vela(2, 100, 100, 99, 99.4)], { estrategia: { ...base, saida } }),
    );
    expect(d).toMatchObject({ situacao: "concluido", motivo: "regra", barras: 2 });
    if (d.situacao !== "concluido") throw new Error("esperava concluído");
    expect(d.resultado.toFixed()).toBe("-0.6");
  });

  it("tempo máximo da estratégia: sai no fechamento do candle N", () => {
    const d = simularDesfecho(
      pedido([parada(1, 100), parada(2, 101), parada(3, 101.5), parada(4, 102)], {
        estrategia: { ...base, tempoMaximo: 3 },
      }),
    );
    expect(d).toMatchObject({ situacao: "concluido", motivo: "tempo", barras: 3 });
    if (d.situacao !== "concluido") throw new Error("esperava concluído");
    expect(d.resultado.toFixed()).toBe("1.5");
  });

  it("sem desfecho e antes do horizonte: pendente", () => {
    expect(simularDesfecho(pedido([parada(1, 100), parada(2, 101)]))).toEqual({
      situacao: "pendente",
      barras: 2,
    });
    expect(simularDesfecho(pedido([]))).toEqual({ situacao: "pendente", barras: 0 });
  });

  it("chegou ao horizonte sem stop nem alvo: fecha no fechamento do último candle", () => {
    const d = simularDesfecho(pedido([parada(1, 100), parada(2, 101), parada(3, 102)], { horizonte: 2 }));
    expect(d).toMatchObject({ situacao: "concluido", motivo: "horizonte", barras: 2 });
    if (d.situacao !== "concluido") throw new Error("esperava concluído");
    expect(d.resultado.toString()).toBe("1");
  });

  it("stop móvel: sobe com a máxima e a saída usa o stop novo no candle seguinte", () => {
    const estrategia: Estrategia = {
      ...base,
      alvoLiquido: 0.5,
      stopMovel: { tipo: "percentual", distancia: 0.02 },
    };
    const d = simularDesfecho(
      pedido([vela(1, 100, 110, 105, 108), vela(2, 108, 108.5, 107, 107.5)], { estrategia }),
    );
    expect(d).toMatchObject({ situacao: "concluido", motivo: "stop", barras: 2 });
    if (d.situacao !== "concluido") throw new Error("esperava concluído");
    expect(d.saida.toString()).toBe("107.8");
  });

  it("a proteção efetiva da decisão (stop e alvo gravados) vale no lugar da estratégia", () => {
    const d = simularDesfecho(
      pedido([vela(1, 100, 100.5, 98.9, 99.5)], { protecao: { stop: dec(99), alvo: dec(101) } }),
    );
    expect(d).toMatchObject({ situacao: "concluido", motivo: "stop" });
    if (d.situacao !== "concluido") throw new Error("esperava concluído");
    expect(d.resultado.toString()).toBe("-1");
  });

  it("recusa pedido sem sentido", () => {
    expect(() => simularDesfecho(pedido([], { horizonte: 0 }))).toThrow(RangeError);
    expect(() => simularDesfecho(pedido([], { quantidade: dec(0) }))).toThrow(RangeError);
    expect(() => simularDesfecho(pedido([], { preco: dec(0) }))).toThrow(RangeError);
  });
});

describe("desfecho contrafactual no mini índice (WIN)", () => {
  const win: CustosDesfecho = { mercado: "win", custos: CUSTOS_WIN_PADRAO };
  const pedidoWin = (depois: readonly Candle[], extra: Partial<PedidoDesfecho> = {}) =>
    pedido(depois, {
      estrategia: { ...base, stop: 0.005, alvoLiquido: 0.01 },
      preco: dec(130_000),
      quantidade: dec(2),
      custos: win,
      antes: [parada(0, 130_000)],
      ...extra,
    });

  it("comprado no alvo: tick contra na entrada e na saída, tarifa da B3 nos dois lados", () => {
    const d = simularDesfecho(pedidoWin([vela(1, 130_000, 131_400, 129_900, 131_350)]));
    expect(d).toMatchObject({ situacao: "concluido", motivo: "alvo", barras: 1 });
    if (d.situacao !== "concluido") throw new Error("esperava concluído");
    // entrada 130.000 → 130.005; alvo 1% = 131.305,05 → venda no tick 131.305 − 5 = 131.300
    expect(d.entrada.toString()).toBe("130005");
    expect(d.saida.toString()).toBe("131300");
    // 1.295 pontos × R$ 0,20 × 2 = R$ 518; tarifa 0,25 × 2 lados × 2 contratos = R$ 1
    expect(d.resultado.toString()).toBe("517");
  });

  it("vendido: o stop é tocado pela MÁXIMA e a recompra sai com tick contra", () => {
    const d = simularDesfecho(
      pedidoWin([vela(1, 130_000, 130_700, 129_900, 130_600)], {
        sentido: "vendido",
        quantidade: dec(1),
      }),
    );
    expect(d).toMatchObject({ situacao: "concluido", motivo: "stop", barras: 1 });
    if (d.situacao !== "concluido") throw new Error("esperava concluído");
    // venda 130.000 → 129.995; stop 0,5% acima = 130.644,975 → recompra 130.645 + 5 = 130.650
    expect(d.entrada.toString()).toBe("129995");
    expect(d.saida.toString()).toBe("130650");
    // −655 pontos × R$ 0,20 = −R$ 131; tarifa 0,25 × 2 = R$ 0,50
    expect(d.resultado.toString()).toBe("-131.5");
  });

  it("vendido no alvo ganha com a queda", () => {
    const d = simularDesfecho(
      pedidoWin([vela(1, 130_000, 130_100, 128_500, 128_700)], {
        sentido: "vendido",
        quantidade: dec(1),
      }),
    );
    expect(d).toMatchObject({ situacao: "concluido", motivo: "alvo" });
    if (d.situacao !== "concluido") throw new Error("esperava concluído");
    expect(d.resultado.gt(0)).toBe(true);
  });

  it("com a sessão da B3: zera na hora da zeragem", () => {
    // 21h05 UTC = 18h05 de Brasília; o candle das 18h10 termina às 18h15 (zeragem)
    const tarde = Date.UTC(2026, 9, 13, 21, 5);
    const d = simularDesfecho(
      pedidoWin([parada(1, 130_100, tarde), parada(2, 130_200, tarde), parada(3, 130_300, tarde)], {
        antes: [parada(0, 130_000, tarde)],
        custos: { ...win, sessao: SESSAO_B3_PADRAO },
      }),
    );
    expect(d).toMatchObject({ situacao: "concluido", motivo: "zeragem", barras: 1 });
  });

  it("com a sessão da B3: zera no último candle do dia mesmo antes da hora", () => {
    const amanha = Date.UTC(2026, 9, 14, 13, 0);
    const d = simularDesfecho(
      pedidoWin([parada(1, 130_100), parada(0, 130_200, amanha)], {
        custos: { ...win, sessao: SESSAO_B3_PADRAO },
      }),
    );
    expect(d).toMatchObject({ situacao: "concluido", motivo: "zeragem", barras: 1 });
  });
});
