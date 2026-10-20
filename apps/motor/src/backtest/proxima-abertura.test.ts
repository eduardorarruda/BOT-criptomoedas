import { dec, type Candle, type Estrategia, type Regra } from "@zentrade/dominio";
import { describe, expect, it } from "vitest";
import { ESTRATEGIA } from "../teste/cenario.js";
import { rodarBacktest, type EntradaBacktest } from "./rodar.js";

const QUINZE = 15 * 60_000;
const T0 = Date.UTC(2026, 0, 1);

const vela = (i: number, o: number, h: number, l: number, c: number): Candle => ({
  abertura: T0 + i * QUINZE,
  fechamento: T0 + (i + 1) * QUINZE - 1,
  abre: dec(o),
  maxima: dec(h),
  minima: dec(l),
  fecha: dec(c),
  volume: dec(1),
});
const planas = (n: number, preco = 100): Candle[] =>
  Array.from({ length: n }, (_, i) => vela(i, preco, preco, preco, preco));

const entrada = (candles: Candle[], extra: Partial<EntradaBacktest> = {}): EntradaBacktest => ({
  simbolo: "BTCUSDT",
  intervalo: "15m",
  candles,
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

const NA_ABERTURA = { execucao: "proximaAbertura" } as const;
/** Compra na queda abaixo de 95 e vende quando o preço passa de 93,5 (antes do alvo). */
const comSaida: Estrategia = {
  ...ESTRATEGIA,
  saida: {
    tipo: "comparar",
    esquerda: { tipo: "preco" },
    comparador: ">",
    direita: { tipo: "numero", valor: 93.5 },
  },
};
const taxa = 0.001;

describe("backtest de cripto na abertura do candle seguinte (contas à mão)", () => {
  it("a compra decidida no fechamento é executada na abertura seguinte, com o mesmo tamanho", async () => {
    const candles = [
      ...planas(20),
      vela(20, 100, 100, 93.9, 94), // 94 < 95: decide comprar
      vela(21, 93, 93.4, 92.8, 93.2), // abre 93: executa
      vela(22, 93.2, 93.2, 93.2, 93.2),
    ];
    const antes = await rodarBacktest(entrada(candles));
    const r = await rodarBacktest(entrada(candles, NA_ABERTURA));
    // no fechamento da decisão ainda não há posição
    expect(r.curva[20]!.patrimonio.toString()).toBe("1000");
    // quantidade dimensionada no preço da decisão (94): igual à do modo no fechamento
    const quantidade = r.taxasPagas.div(dec(93).times(taxa));
    expect(quantidade.toNumber()).toBeCloseTo(antes.taxasPagas.div(dec(94).times(taxa)).toNumber(), 6);
    // marcação a 93,2 depois de comprar a 93 (e não a 94): quantidade × 0,2 − taxa
    const esperado = dec(1000).plus(quantidade.times("0.2")).minus(r.taxasPagas);
    expect(r.curva[21]!.patrimonio.minus(esperado).abs().lt("1e-6")).toBe(true);
    expect(r.ordens).toBe(1);
  });

  it("saída por regra decidida no fechamento é executada na abertura seguinte", async () => {
    const candles = [
      ...planas(20),
      vela(20, 100, 100, 93.9, 94), // decide comprar
      vela(21, 93, 93.4, 92.8, 93.2), // compra a 93
      vela(22, 93.2, 93.8, 93.2, 93.8), // fecha acima de 93,5: decide vender
      vela(23, 93.6, 96, 93.5, 96), // abre 93,6: vende (e sobe, sem nova compra)
      vela(24, 96, 96, 96, 96),
    ];
    const r = await rodarBacktest(entrada(candles, { estrategia: comSaida, ...NA_ABERTURA }));
    expect(r.operacoesFechadas).toHaveLength(1);
    const op = r.operacoesFechadas[0]!;
    expect(op.abertaEm).toBe(candles[21]!.abertura);
    expect(op.fechadaEm).toBe(candles[23]!.abertura);
    // taxas dos dois lados: quantidade × (93 + 93,6) × 0,1%
    const quantidade = r.taxasPagas.div(dec(93).plus("93.6").times(taxa));
    const esperado = quantidade.times("0.6").minus(r.taxasPagas);
    expect(op.resultado.minus(esperado).abs().lt("1e-6")).toBe(true);
    expect(r.ordens).toBe(2);
  });

  it("stop e alvo continuam dentro do candle, inclusive no candle da entrada", async () => {
    const candles = [
      ...planas(20),
      vela(20, 100, 100, 93.9, 94), // decide comprar
      vela(21, 93, 97, 92.9, 96.5), // compra a 93 e a máxima passa do alvo no mesmo candle
      vela(22, 96.5, 96.5, 96.5, 96.5),
    ];
    const r = await rodarBacktest(entrada(candles, NA_ABERTURA));
    expect(r.saidasIntrabar.alvo).toBe(1);
    expect(r.operacoesFechadas).toHaveLength(1);
    expect(r.operacoesFechadas[0]!.abertaEm).toBe(candles[21]!.abertura);
    expect(r.operacoesFechadas[0]!.resultado.gt(0)).toBe(true);
  });

  it("sem candle seguinte: entrada no último candle não abre", async () => {
    const candles = [...planas(20), vela(20, 100, 100, 93.9, 94)]; // sinal no último candle
    const r = await rodarBacktest(entrada(candles, NA_ABERTURA));
    expect(r.ordens).toBe(0);
    expect(r.operacoes).toBe(0);
    expect(r.patrimonioFinal.toString()).toBe("1000");
  });

  it("sem candle seguinte: a saída por regra no último candle executa no fechamento dele", async () => {
    const candles = [
      ...planas(20),
      vela(20, 100, 100, 93.9, 94), // decide comprar
      vela(21, 93, 93.4, 92.8, 93.2), // compra a 93
      vela(22, 93.2, 93.8, 93.2, 93.8), // último: fecha acima de 93,5, vende a 93,8
    ];
    const r = await rodarBacktest(entrada(candles, { estrategia: comSaida, ...NA_ABERTURA }));
    expect(r.operacoesFechadas).toHaveLength(1);
    const op = r.operacoesFechadas[0]!;
    expect(op.fechadaEm).toBe(candles[22]!.fechamento);
    const quantidade = r.taxasPagas.div(dec(93).plus("93.8").times(taxa));
    const esperado = quantidade.times("0.8").minus(r.taxasPagas);
    expect(op.resultado.minus(esperado).abs().lt("1e-6")).toBe(true);
    // a curva do último candle já inclui a venda
    expect(r.curva.at(-1)!.patrimonio.equals(dec(1000).plus(op.resultado))).toBe(true);
  });

  it("o padrão não muda nada: sem o campo e com `fechamento` o resultado é o mesmo", async () => {
    const candles = [
      ...planas(20),
      vela(20, 100, 100, 93.9, 94),
      vela(21, 93, 93.4, 92.8, 93.2),
      vela(22, 93.2, 93.8, 93.2, 93.8),
      vela(23, 93.6, 93.7, 93.5, 93.7),
    ];
    const semCampo = await rodarBacktest(entrada(candles, { estrategia: comSaida }));
    const explicito = await rodarBacktest(entrada(candles, { estrategia: comSaida, execucao: "fechamento" }));
    expect(explicito).toEqual(semCampo);
    // no fechamento, a compra é a 94 (fecha da decisão) e a venda a 93,8
    expect(semCampo.operacoesFechadas[0]!.abertaEm).toBe(candles[20]!.fechamento);
  });
});

describe("filtro de horário no backtest de cripto", () => {
  const dip = (n: number): Candle[] => [
    ...planas(n),
    vela(n, 100, 100, 93.9, 94), // 94 < 95 às 04:30 de Brasília (07:30 UTC)
    vela(n + 1, 94, 94, 94, 94),
    vela(n + 2, 100, 100, 100, 100),
  ];
  const horario = (de: string, ate: string): Regra => ({ tipo: "horario", de, ate });
  const comJanela = (de: string, ate: string): Estrategia => ({
    ...ESTRATEGIA,
    entrada: { tipo: "e", regras: [ESTRATEGIA.entrada, horario(de, ate)] },
  });
  // O índice 30 abre às 07:30 UTC, ou 04:30 em Brasília (UTC−3)

  it("só opera dentro da janela, no fuso de Brasília", async () => {
    const candles = dip(30);
    expect(
      (await rodarBacktest(entrada(candles, { estrategia: comJanela("04:00", "05:00") }))).ordens,
    ).toBeGreaterThan(0);
    expect((await rodarBacktest(entrada(candles, { estrategia: comJanela("10:00", "11:00") }))).ordens).toBe(
      0,
    );
    // 07:30 UTC cairia nesta janela se o fuso fosse UTC: confirma que a hora lida é a de Brasília
    expect((await rodarBacktest(entrada(candles, { estrategia: comJanela("07:00", "08:00") }))).ordens).toBe(
      0,
    );
  });

  it("a borda é [de, ate) e a janela pode cruzar a meia-noite", async () => {
    const candles = dip(30);
    expect(
      (await rodarBacktest(entrada(candles, { estrategia: comJanela("04:30", "05:00") }))).ordens,
    ).toBeGreaterThan(0);
    expect((await rodarBacktest(entrada(candles, { estrategia: comJanela("04:00", "04:30") }))).ordens).toBe(
      0,
    );
    expect(
      (await rodarBacktest(entrada(candles, { estrategia: comJanela("22:00", "06:00") }))).ordens,
    ).toBeGreaterThan(0);
  });

  it("usa o fuso da instância quando ele vem na entrada", async () => {
    const candles = dip(30);
    const noFuso = (fuso: string) => entrada(candles, { estrategia: comJanela("07:00", "08:00"), fuso });
    expect((await rodarBacktest(noFuso("UTC"))).ordens).toBeGreaterThan(0);
    expect((await rodarBacktest(noFuso("America/Sao_Paulo"))).ordens).toBe(0);
  });
});
