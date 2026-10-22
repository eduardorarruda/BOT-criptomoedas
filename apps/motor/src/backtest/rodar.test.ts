import { dec, MODELOS, type Candle, type Estrategia } from "@zentrade/dominio";
import { describe, expect, it } from "vitest";
import { candle, serie } from "../teste/candles.js";
import { ESTRATEGIA } from "../teste/cenario.js";
import { duracaoDaQueda, maiorQueda } from "./metricas.js";
import { rodarBacktest, type EntradaBacktest } from "./rodar.js";

const QUINZE = 15 * 60_000;
const T0 = Date.UTC(2026, 0, 1);

const entrada = (precos: (number | string)[], extra: Partial<EntradaBacktest> = {}): EntradaBacktest => ({
  simbolo: "BTCUSDT",
  intervalo: "15m",
  candles: serie(T0, precos, QUINZE),
  estrategia: ESTRATEGIA,
  limites: {
    perdaDiariaMaxima: dec(50),
    exposicaoMaxima: dec(1000),
    ordensPorHoraMax: 10,
    pausaAposPerdaMs: 0,
    confiancaMinima: 0.5,
  },
  riscoPorOperacao: dec(10),
  saldoInicial: dec(1000),
  agente: "sempre_concorda",
  ...extra,
});

const plano = Array<number>(20).fill(100);

describe("backtest", () => {
  it("operação vencedora: compra na queda, vende no alvo, resultado líquido de taxas", async () => {
    const r = await rodarBacktest(entrada([...plano, 94, 94.5, 96, 96]));
    expect(r.operacoes).toBe(1);
    expect(r.acertos).toBe(1);
    expect(r.taxaAcerto).toBe(1);
    expect(r.ordens).toBe(2);
    expect(r.resultadoLiquido.gt(0)).toBe(true);
    expect(r.taxasPagas.gt(0)).toBe(true);
    expect(r.patrimonioFinal.equals(dec(1000).plus(r.resultadoLiquido))).toBe(true);
    expect(r.curva).toHaveLength(24);
    expect(r.curva[0]!.patrimonio.equals(dec(1000))).toBe(true);
  });

  it("operação perdedora no stop: maior queda e taxa de acerto zero", async () => {
    const r = await rodarBacktest(entrada([...plano, 94, 92, 92]));
    expect(r.operacoes).toBe(1);
    expect(r.acertos).toBe(0);
    expect(r.taxaAcerto).toBe(0);
    expect(r.resultadoLiquido.lt(0)).toBe(true);
    expect(r.maiorQueda.gt(0)).toBe(true);
    expect(r.maiorQuedaPercentual).toBeGreaterThan(0);
  });

  it("agente que nunca concorda: nenhuma operação, patrimônio parado", async () => {
    const r = await rodarBacktest(entrada([...plano, 94, 96], { agente: "nunca_concorda" }));
    expect(r.operacoes).toBe(0);
    expect(r.ordens).toBe(0);
    expect(r.taxaAcerto).toBe(0);
    expect(r.resultadoLiquido.isZero()).toBe(true);
    expect(r.maiorQueda.isZero()).toBe(true);
  });

  it("janela com aquecimento: indicadores usam os candles antes do início", async () => {
    const porMedia: Estrategia = {
      ...ESTRATEGIA,
      entrada: {
        tipo: "comparar",
        esquerda: { tipo: "preco" },
        comparador: "<",
        direita: {
          tipo: "multiplicar",
          operando: { tipo: "indicador", nome: "sma", periodo: 20 },
          fator: 0.97,
        },
      },
    };
    const precos = [...plano, 94, 96, 96];
    const inicio = T0 + 20 * QUINZE;
    const com = await rodarBacktest(entrada(precos, { estrategia: porMedia, inicio }));
    expect(com.operacoes).toBe(1);
    expect(com.curva[0]!.em).toBe(inicio + QUINZE - 1);
    const sem = await rodarBacktest(entrada(precos, { estrategia: porMedia, inicio, aquecimento: 0 }));
    expect(sem.operacoes).toBe(0);
    const ate = await rodarBacktest(entrada(precos, { estrategia: porMedia, inicio, fim: inicio + QUINZE }));
    expect(ate.curva).toHaveLength(1);
  });

  it("é determinístico: mesma entrada, mesmo resultado", async () => {
    const e = entrada([...plano, 94, 92, 93, 94, 96, 90, 94, 97], {
      custos: { taxaPorLado: 0.001, deslizamentoBps: 5, meioSpreadBps: 2 },
    });
    expect(await rodarBacktest(e)).toEqual(await rodarBacktest(e));
  });

  it("recusa estratégia inválida e janela vazia com explicação", async () => {
    await expect(rodarBacktest(entrada(plano, { estrategia: { ...ESTRATEGIA, stop: 0.9 } }))).rejects.toThrow(
      /stop/,
    );
    await expect(rodarBacktest(entrada(plano, { inicio: T0 + 100 * QUINZE }))).rejects.toThrow(
      /nenhum candle/,
    );
  });
});

/** Candle do intervalo com abertura, máxima, mínima e fechamento informados. */
const vela = (i: number, abre: number, maxima: number, minima: number, fecha: number): Candle => ({
  ...candle(T0 + i * QUINZE, fecha, QUINZE),
  abre: dec(abre),
  maxima: dec(maxima),
  minima: dec(minima),
});

describe("stop e alvo dentro do candle", () => {
  // Compra no fechamento a 94: stop 92,12; alvo líquido em 95,13.
  const comVelas = (velas: Candle[], extra: Partial<EntradaBacktest> = {}) =>
    entrada([], { candles: [...serie(T0, [...plano, 94], QUINZE), ...velas], ...extra });

  it("a mínima furou o stop e o candle fechou acima: sai NO stop, não no fechamento", async () => {
    const r = await rodarBacktest(comVelas([vela(21, 94, 94.5, 92, 96), vela(22, 96, 96, 96, 96)]));
    expect(r.operacoes).toBe(1);
    expect(r.acertos).toBe(0);
    expect(r.saidasIntrabar).toEqual({ stop: 1, alvo: 0, ambiguos: 0 });
    expect(r.operacoesFechadas[0]?.resultado.lt(0)).toBe(true);
    expect(r.barrasExpostas).toBe(1);
  });

  it("a máxima tocou o alvo e o candle fechou abaixo: sai no alvo", async () => {
    const r = await rodarBacktest(comVelas([vela(21, 94, 95.5, 93.5, 95.05), vela(22, 96, 96, 96, 96)]));
    expect(r.saidasIntrabar).toEqual({ stop: 0, alvo: 1, ambiguos: 0 });
    expect(r.acertos).toBe(1);
  });

  it("stop e alvo no mesmo candle: pior caso, conta o stop", async () => {
    const r = await rodarBacktest(comVelas([vela(21, 94, 96, 92, 95.5), vela(22, 96, 96, 96, 96)]));
    expect(r.saidasIntrabar).toEqual({ stop: 1, alvo: 0, ambiguos: 1 });
    expect(r.acertos).toBe(0);
  });

  it("com candles de 1 minuto, a ordem real decide: aqui o alvo veio antes", async () => {
    const inicio = T0 + 21 * QUINZE;
    const minutos: Candle[] = [
      { ...candle(inicio, 95.8), abre: dec(94), maxima: dec(96) },
      { ...candle(inicio + 60_000, 92.5), minima: dec(92) },
      candle(inicio + 120_000, 95.5),
    ];
    const r = await rodarBacktest(
      comVelas([vela(21, 94, 96, 92, 95.5), vela(22, 96, 96, 96, 96)], { minutos }),
    );
    expect(r.saidasIntrabar).toEqual({ stop: 0, alvo: 1, ambiguos: 0 });
    expect(r.acertos).toBe(1);
  });
});

describe("saídas da estratégia nova: stop por ATR, stop móvel e tempo", () => {
  const plana = (n: number, preco = 100) =>
    Array.from({ length: n }, (_, i) => vela(i, preco, preco + 1, preco - 1, preco));

  it("modelo Donchian 20/10 de ponta a ponta: o stop por ATR acertado na compra sai dentro do candle", async () => {
    const donchian = MODELOS.find((x) => x.id === "donchian-20-10")!.estrategia;
    // 30 candles entre 99 e 101 (ATR ≈ 2), rompimento a 105 e uma queda que fura o stop
    // por ATR (≈ 105 − 2 × ATR), mas não o stop fixo de 10% (94,5) nem a saída (Donchian 10).
    const candles = [
      ...plana(30),
      vela(30, 101, 105.5, 101, 105),
      vela(31, 104.5, 104.5, 100, 103),
      vela(32, 103, 103, 103, 103),
    ];
    const r = await rodarBacktest(entrada([], { candles, estrategia: donchian }));
    expect(r.operacoes).toBe(1);
    expect(r.saidasIntrabar).toEqual({ stop: 1, alvo: 0, ambiguos: 0 });
    // Saiu entre o stop por ATR e a abertura: perdeu menos que os 10% do stop fixo.
    expect(r.operacoesFechadas[0]!.resultado.lt(0)).toBe(true);
    expect(r.resultadoLiquido.gt(-10.5)).toBe(true);
  });

  it("stop móvel: sobe com a máxima no fechamento e só vale a partir do candle seguinte", async () => {
    const movel: Estrategia = {
      ...ESTRATEGIA,
      stop: 0.05,
      alvoLiquido: 0.5,
      stopMovel: { tipo: "percentual", distancia: 0.02 },
    };
    const candles = [
      ...serie(T0, [...plano, 94], QUINZE),
      // máxima 100 e mínima 97,5 no MESMO candle: o stop ainda é o fixo (89,3), não sai.
      vela(21, 95, 100, 97.5, 99),
      // agora o stop é 98 (2% abaixo de 100): a mínima 97 o fura e sai em 98, pior caso.
      vela(22, 99, 99.5, 97, 99.5),
      vela(23, 99.5, 99.5, 99.5, 99.5),
    ];
    const r = await rodarBacktest(entrada([], { candles, estrategia: movel }));
    expect(r.operacoes).toBe(1);
    expect(r.saidasIntrabar.stop).toBe(1);
    expect(r.operacoesFechadas[0]!.fechadaEm).toBe(T0 + 23 * QUINZE - 1);
    // Comprou a 94 e saiu no stop móvel de 98: lucro, não a perda do stop fixo.
    expect(r.acertos).toBe(1);
  });

  it("stop móvel que sobe acima do fechamento vende no fechamento (o candle subiu e voltou)", async () => {
    const movel: Estrategia = {
      ...ESTRATEGIA,
      stop: 0.05,
      alvoLiquido: 0.5,
      stopMovel: { tipo: "percentual", distancia: 0.02 },
    };
    const candles = [
      ...serie(T0, [...plano, 94], QUINZE),
      vela(21, 95, 100, 97.5, 97.8),
      vela(22, 99, 99, 99, 99),
    ];
    const r = await rodarBacktest(entrada([], { candles, estrategia: movel }));
    expect(r.operacoes).toBe(1);
    expect(r.operacoesFechadas[0]!.fechadaEm).toBe(T0 + 22 * QUINZE - 1);
    expect(r.saidasIntrabar.stop).toBe(0);
  });

  it("saída por tempo: vende no fechamento do N-ésimo candle sem resolver", async () => {
    const tempo: Estrategia = { ...ESTRATEGIA, tempoMaximo: 2 };
    const r = await rodarBacktest(entrada([...plano, 94, 94.2, 94.4, 96, 96], { estrategia: tempo }));
    expect(r.operacoes).toBe(1);
    expect(r.operacoesFechadas[0]!.fechadaEm).toBe(T0 + 23 * QUINZE - 1);
    expect(r.saidasIntrabar).toEqual({ stop: 0, alvo: 0, ambiguos: 0 });
  });
});

describe("custos em toda execução", () => {
  const precos = [...plano, 94, 94.5, 96, 96];

  it("deslizamento e meio spread pioram cada execução e são somados à parte das taxas", async () => {
    const custos = { taxaPorLado: 0.001, deslizamentoBps: 5, meioSpreadBps: 2 };
    const sem = await rodarBacktest(entrada(precos));
    const com = await rodarBacktest(entrada(precos, { custos }));
    expect(sem.deslizamentoPago.isZero()).toBe(true);
    expect(com.deslizamentoPago.gt(0)).toBe(true);
    expect(com.resultadoLiquido.lt(sem.resultadoLiquido)).toBe(true);
    expect(com.operacoesFechadas).toHaveLength(1);
    expect(com.taxasPagas.gt(0)).toBe(true);
  });

  it("taxa com BNB (0,075%) paga menos taxa que a VIP0 (0,1%)", async () => {
    const vip0 = await rodarBacktest(
      entrada(precos, { custos: { taxaPorLado: 0.001, deslizamentoBps: 0, meioSpreadBps: 0 } }),
    );
    const bnb = await rodarBacktest(
      entrada(precos, { custos: { taxaPorLado: 0.00075, deslizamentoBps: 0, meioSpreadBps: 0 } }),
    );
    expect(bnb.taxasPagas.lt(vip0.taxasPagas)).toBe(true);
  });

  it("traz o buy and hold do mesmo período, ponto a ponto com a curva", async () => {
    const r = await rodarBacktest(entrada(precos));
    expect(r.buyHold.curva.map((p) => p.em)).toEqual(r.curva.map((p) => p.em));
    expect(r.candles).toHaveLength(precos.length);
  });
});

describe("maior queda", () => {
  it("maior distância de um pico até um vale posterior", () => {
    const curva = [100, 120, 90, 130, 117, 140].map((p, em) => ({ em, patrimonio: dec(p) }));
    const q = maiorQueda(curva);
    expect(q.valor.equals(dec(30))).toBe(true);
    expect(q.percentual).toBeCloseTo(0.25, 10);
    expect(maiorQueda([]).valor.isZero()).toBe(true);
  });

  it("duração: do pico até recuperar o pico, ou até o fim se não recuperou", () => {
    const curva = (valores: number[]) => valores.map((p, i) => ({ em: i * 10, patrimonio: dec(p) }));
    const recuperou = curva([100, 120, 90, 110, 125, 100]);
    expect(duracaoDaQueda(recuperou, maiorQueda(recuperou))).toEqual({ duracaoMs: 30, recuperada: true });
    const naoRecuperou = curva([100, 120, 90, 110]);
    expect(duracaoDaQueda(naoRecuperou, maiorQueda(naoRecuperou))).toEqual({
      duracaoMs: 20,
      recuperada: false,
    });
    expect(duracaoDaQueda([], maiorQueda([]))).toEqual({ duracaoMs: 0, recuperada: true });
  });
});

describe("tamanho por alocação (cofre de tendência)", () => {
  const cofre: Estrategia = {
    entrada: {
      tipo: "comparar",
      esquerda: { tipo: "preco" },
      comparador: "<",
      direita: { tipo: "numero", valor: 101 },
    },
    saida: {
      tipo: "comparar",
      esquerda: { tipo: "preco" },
      comparador: ">",
      direita: { tipo: "numero", valor: 105 },
    },
    stop: 0.49,
    alvoLiquido: 0.99,
    taxa: 0.001,
  };
  // compra a 100 no primeiro candle e sai a 110 na regra de saída: +10 por unidade
  const precos = [100, 110, 110, 110];

  it("compra fração × exposição máxima, ignorando o risco por operação", async () => {
    const r = await rodarBacktest(
      entrada(precos, { estrategia: { ...cofre, tamanhoPorAlocacao: { fracao: 0.5 } } }),
    );
    expect(r.operacoes).toBe(1);
    // 500 de exposição = 5 unidades a 100 -> cerca de +50, menos as duas taxas (~1)
    expect(r.resultadoLiquido.gt(48)).toBe(true);
    expect(r.resultadoLiquido.lt(50)).toBe(true);
    expect(r.saidasIntrabar.stop).toBe(0);
  });

  it("sem o campo, o tamanho continua sendo o do risco por operação (risco 10 ÷ stop 49 = 0,2 unidade)", async () => {
    const r = await rodarBacktest(entrada(precos, { estrategia: cofre }));
    expect(r.operacoes).toBe(1);
    expect(r.resultadoLiquido.gt(1.5)).toBe(true);
    expect(r.resultadoLiquido.lt(2)).toBe(true);
  });

  it("o saldo livre limita a alocação inteira (fração 1 sobre exposição maior que o saldo)", async () => {
    const r = await rodarBacktest(
      entrada(precos, {
        estrategia: { ...cofre, tamanhoPorAlocacao: { fracao: 1 } },
        limites: { ...entrada([]).limites, exposicaoMaxima: dec(5000) },
      }),
    );
    // saldo de 1000: ~10 unidades a 100 -> cerca de +100 menos taxas, nunca +500
    expect(r.resultadoLiquido.gt(95)).toBe(true);
    expect(r.resultadoLiquido.lt(100)).toBe(true);
  });
});
