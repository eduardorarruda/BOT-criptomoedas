import { ConfiguracaoWinEsquema } from "@zentrade/contratos";
import { dec, diaB3, MODELOS_WIN, type Estrategia, type LimitesRisco, type Regra } from "@zentrade/dominio";
import { describe, expect, it } from "vitest";
import {
  brasilia,
  CINCO_MIN,
  diasUteis,
  parada,
  pregao,
  serieWinIbov,
  velaWin,
  type Vela,
} from "../../teste/win.js";
import { modeloWinDe, type ModeloWin } from "./modelo.js";
import { rodarBacktestWin, type EntradaBacktestWin } from "./rodar.js";

const DIA = "2026-10-13";
const preco = { tipo: "preco" } as const;
const numero = (valor: number) => ({ tipo: "numero", valor }) as const;
const sempre: Regra = { tipo: "comparar", esquerda: preco, comparador: ">", direita: numero(0) };
const nunca: Regra = { tipo: "nao", regra: sempre };

/** Risco R$ 300 por operação; resto dos padrões do WIN (R$ 0,25 por lado, 1 tick). */
const modelo: ModeloWin = modeloWinDe(ConfiguracaoWinEsquema.parse({ riscoPorOperacao: "300" }));

const compra: Estrategia = {
  entrada: { tipo: "comparar", esquerda: preco, comparador: "cruzouAcima", direita: numero(130_100) },
  stop: 0.005,
  alvoLiquido: 0.01,
  taxa: 0,
};
const venda: Estrategia = {
  entrada: nunca,
  direcao: "vendido",
  entradaVendida: { tipo: "comparar", esquerda: preco, comparador: "cruzouAbaixo", direita: numero(129_900) },
  stop: 0.005,
  alvoLiquido: 0.01,
  taxa: 0,
};

const rodar = (candles: EntradaBacktestWin["candles"], extra: Partial<EntradaBacktestWin> = {}) =>
  rodarBacktestWin({
    simbolo: "WIN-IBOV",
    candles,
    estrategia: compra,
    modelo,
    limites: null,
    saldoInicial: dec(5000),
    ...extra,
  });

describe("backtest do mini índice: contas de uma operação (feitas à mão)", () => {
  it("comprado: entra no fechamento + 1 tick, 2 contratos pelo risco, zera no último candle do dia", () => {
    const candles = pregao(DIA, "10:00", [
      parada(130_000),
      { o: 130_000, h: 130_130, l: 129_990, c: 130_120 }, // cruza 130.100: compra
      { o: 130_125, h: 130_300, l: 130_100, c: 130_250 },
      parada(130_400),
      { o: 130_400, h: 130_650, l: 130_380, c: 130_600 }, // último do pregão: zera
    ]);
    const r = rodar(candles);
    expect(r.operacoes).toHaveLength(1);
    const op = r.operacoes[0]!;
    // entrada 130.120 → 130.125 (1 tick); stop 0,5% = 129.474,375 (650,625 pontos)
    // perda por contrato: 650,625 × 0,20 + 2,50 = R$ 132,625 → ⌊300 ÷ 132,625⌋ = 2
    expect(op).toMatchObject({ sentido: "comprado", contratos: 2, motivo: "zeragem", dia: DIA });
    expect(op.entrada.toString()).toBe("130125");
    // saída 130.600 → 130.595; 470 pontos × R$ 0,20 × 2 = R$ 188; tarifas 0,25 × 2 lados × 2 = R$ 1
    expect(op.saida.toString()).toBe("130595");
    expect(op.resultado.toString()).toBe("187");
    expect(op.bruto.toString()).toBe("192");
    expect(op.deslizamento.toString()).toBe("4");
    expect(op.tarifas.toString()).toBe("1");
    expect(op.corretagem.toString()).toBe("0");
    expect(op.bruto.minus(op.tarifas).minus(op.deslizamento).equals(op.resultado)).toBe(true);
    expect(r.resultadoLiquido.toString()).toBe("187");
    expect(r.patrimonioFinal.toString()).toBe("5187");
    expect(r.zeragens).toBe(1);
    // no fechamento da entrada: 5000 − 0,50 de tarifa − 2 de marcação (130.120 vs 130.125)
    expect(r.curva[1]!.patrimonio.toString()).toBe("4997.5");
    expect(r.curva).toHaveLength(5);
    expect(r.dias).toBe(1);
  });

  it("vendido: o stop é tocado pela MÁXIMA dentro do candle e sai com 1 tick contra", () => {
    const candles = pregao(DIA, "10:00", [
      parada(130_000),
      { o: 130_000, h: 130_010, l: 129_870, c: 129_880 }, // cruza 129.900 para baixo: vende
      { o: 129_900, h: 130_600, l: 129_850, c: 130_550 }, // máxima passa do stop
      parada(130_550),
    ]);
    const r = rodar(candles, { estrategia: venda });
    expect(r.operacoes).toHaveLength(1);
    const op = r.operacoes[0]!;
    // venda 129.880 → 129.875; stop 129.875 × 1,005 = 130.524,375 → recompra 130.525 + 5 = 130.530
    expect(op).toMatchObject({ sentido: "vendido", contratos: 2, motivo: "stop" });
    expect(op.entrada.toString()).toBe("129875");
    expect(op.referenciaSaida.toString()).toBe("130524.375");
    expect(op.saida.toString()).toBe("130530");
    // −655 pontos × 0,20 × 2 = −262; −1 de tarifas
    expect(op.resultado.toString()).toBe("-263");
    expect(r.saidasIntrabar).toEqual({ stop: 1, alvo: 0, ambiguos: 0 });
  });

  it("vendido com stop e alvo no mesmo candle: pior caso, conta o stop", () => {
    const candles = pregao(DIA, "10:00", [
      parada(130_000),
      { o: 130_000, h: 130_010, l: 129_870, c: 129_880 },
      { o: 129_900, h: 130_600, l: 128_500, c: 129_000 },
      parada(129_000),
    ]);
    const r = rodar(candles, { estrategia: venda });
    expect(r.operacoes[0]?.motivo).toBe("stop");
    expect(r.saidasIntrabar).toEqual({ stop: 1, alvo: 0, ambiguos: 1 });
  });

  it("vendido no alvo: a mínima toca o alvo abaixo", () => {
    const candles = pregao(DIA, "10:00", [
      parada(130_000),
      { o: 130_000, h: 130_010, l: 129_870, c: 129_880 },
      { o: 129_800, h: 129_850, l: 128_500, c: 128_700 }, // alvo 129.875 × 0,99 = 128.576,25
      parada(128_700),
    ]);
    const r = rodar(candles, { estrategia: venda });
    const op = r.operacoes[0]!;
    expect(op.motivo).toBe("alvo");
    // recompra no tick acima do alvo (128.580) + 1 tick = 128.585
    expect(op.saida.toString()).toBe("128585");
    expect(op.resultado.gt(0)).toBe(true);
  });

  it("a taxa percentual da estratégia (modelo do cripto) não mexe no alvo nem no empate do WIN", () => {
    const candles = pregao(DIA, "10:00", [
      parada(130_000),
      { o: 130_000, h: 130_010, l: 129_870, c: 129_880 },
      { o: 129_800, h: 129_850, l: 128_500, c: 128_700 },
      parada(128_700),
    ]);
    const comTaxa: Estrategia = { ...venda, taxa: 0.001, empate: { gatilho: 0.003 } };
    const semTaxa: Estrategia = { ...venda, empate: { gatilho: 0.003 } };
    const a = rodar(candles, { estrategia: comTaxa });
    const b = rodar(candles, { estrategia: semTaxa });
    // os custos do WIN vêm do modelo do contrato (tarifa por contrato e ticks), não da taxa
    expect(a.operacoes).toEqual(b.operacoes);
    expect(a.operacoes[0]!.motivo).toBe("alvo");
  });

  it("nem 1 contrato cabe no risco: não opera e conta o sinal", () => {
    const candles = pregao(DIA, "10:00", [
      parada(130_000),
      { o: 130_000, h: 130_130, l: 129_990, c: 130_120 },
      parada(130_120),
    ]);
    const pouco = { ...modelo, riscoPorOperacao: dec(100) };
    const r = rodar(candles, { modelo: pouco });
    expect(r.operacoes).toHaveLength(0);
    expect(r.semEspacoNoRisco).toBe(1);
    // a margem também limita: R$ 200 de capital paga 1 contrato de R$ 155
    const margem = rodar(candles, { saldoInicial: dec(200) });
    expect(margem.operacoes[0]?.contratos).toBe(1);
  });
});

/** Um pregão do WIN de verdade: 09:00 às 18:25, preço parado. */
const pregaoCompleto = (dia: string) =>
  pregao(
    dia,
    "09:00",
    Array.from({ length: 114 }, () => parada(130_000)),
  );
const sempreComprado: Estrategia = { entrada: sempre, stop: 0.004, alvoLiquido: 0.01, taxa: 0 };

describe("sessão: horários de entrada e zeragem forçada", { timeout: 60_000 }, () => {
  it("entra só às 09:15 e zera no fechamento do candle que termina às 18:15", () => {
    const r = rodar(pregaoCompleto(DIA), { estrategia: sempreComprado });
    expect(r.operacoes).toHaveLength(1);
    const op = r.operacoes[0]!;
    expect(op.abertaEm).toBe(brasilia(DIA, "09:15") - 1);
    expect(op.fechadaEm).toBe(brasilia(DIA, "18:15") - 1);
    expect(op.motivo).toBe("zeragem");
    // parado em 130.000: perde só o deslizamento (2 ticks) e as tarifas
    expect(op.resultado.toString()).toBe(op.tarifas.plus(op.deslizamento).neg().toString());
    // depois da zeragem não abre mais nada (18:15–18:25)
    expect(r.curva.at(-1)?.patrimonio.equals(r.patrimonioFinal)).toBe(true);
  });

  it("zeragem configurável: às 17:00 zera no candle que termina às 17:00", () => {
    const cedo = { ...modelo, sessao: { ...modelo.sessao, fimEntradas: "16:30", zeragem: "17:00" } };
    const r = rodar(pregaoCompleto(DIA), { estrategia: sempreComprado, modelo: cedo });
    expect(r.operacoes[0]?.fechadaEm).toBe(brasilia(DIA, "17:00") - 1);
  });

  it("pula o candle do leilão de abertura; sem pular, entra no fechamento do primeiro", () => {
    const ibov = pregao(
      DIA,
      "10:00",
      Array.from({ length: 96 }, () => parada(130_000)),
    );
    expect(rodar(ibov, { estrategia: sempreComprado }).operacoes[0]?.abertaEm).toBe(
      brasilia(DIA, "10:10") - 1,
    );
    const semPular = { ...modelo, sessao: { ...modelo.sessao, pularLeilaoAbertura: false } };
    const r = rodar(ibov, { estrategia: sempreComprado, modelo: semPular });
    expect(r.operacoes[0]?.abertaEm).toBe(brasilia(DIA, "10:05") - 1);
  });

  it("não abre depois do corte das entradas", () => {
    const giro = { ...sempreComprado, tempoMaximo: 1 };
    const r = rodar(pregaoCompleto(DIA), { estrategia: giro });
    expect(r.operacoes.length).toBeGreaterThan(10);
    const ultimaEntrada = Math.max(...r.operacoes.map((o) => o.abertaEm));
    expect(ultimaEntrada).toBeLessThan(brasilia(DIA, "17:30"));
    expect(ultimaEntrada).toBeGreaterThanOrEqual(brasilia(DIA, "17:25") - 1);
  });

  it("nunca dorme posicionado: toda operação abre e fecha no mesmo pregão", () => {
    const dias = diasUteis("2026-09-01", 15);
    const candles = serieWinIbov(3, dias);
    const [modeloFaixa] = MODELOS_WIN;
    // stop de 5% (nunca tocado num dia) e risco que comporta 2 contratos: uma operação por pregão
    const largo = {
      entrada: sempre,
      stop: 0.05,
      alvoLiquido: 0.5,
      taxa: 0,
      direcao: "ambos" as const,
      entradaVendida: nunca,
    };
    const r = rodar(candles, { estrategia: largo, modelo: { ...modelo, riscoPorOperacao: dec(3000) } });
    const comFaixa = rodar(candles, { estrategia: modeloFaixa!.estrategia });
    for (const op of [...r.operacoes, ...comFaixa.operacoes]) {
      expect(diaB3(op.abertaEm)).toBe(diaB3(op.fechadaEm));
      expect(op.contratos).toBeGreaterThanOrEqual(1);
      expect(op.contratos).toBeLessThanOrEqual(modelo.contratosMaximos);
    }
    expect(r.operacoes).toHaveLength(15);
    expect(r.zeragens).toBe(15);
    expect(r.dias).toBe(15);
    expect(comFaixa.operacoes.length).toBeGreaterThan(0);
  });
});

describe("limites do robô no WIN", () => {
  const limites: LimitesRisco = {
    perdaDiariaMaxima: dec(100),
    exposicaoMaxima: dec(0),
    ordensPorHoraMax: 100,
    pausaAposPerdaMs: 0,
    confiancaMinima: 0,
  };
  /** Dois sinais de venda no mesmo dia; o primeiro perde R$ 263 no stop. */
  const doisSinais = pregao(DIA, "10:00", [
    parada(130_000),
    { o: 130_000, h: 130_010, l: 129_870, c: 129_880 },
    { o: 129_900, h: 130_600, l: 129_850, c: 130_550 },
    parada(130_000),
    { o: 130_000, h: 130_010, l: 129_870, c: 129_880 },
    parada(129_880),
  ]);

  it("perda do dia estourada: barra as entradas seguintes do dia", () => {
    const r = rodar(doisSinais, { estrategia: venda, limites });
    expect(r.operacoes).toHaveLength(1);
    expect(r.barradasPelosLimites).toBe(1);
    expect(rodar(doisSinais, { estrategia: venda }).operacoes).toHaveLength(2);
  });

  it("pausa depois de perda e frequência também barram", () => {
    const pausa = { ...limites, perdaDiariaMaxima: dec(10_000), pausaAposPerdaMs: 60 * 60_000 };
    expect(rodar(doisSinais, { estrategia: venda, limites: pausa }).barradasPelosLimites).toBe(1);
    const frequencia = { ...limites, perdaDiariaMaxima: dec(10_000), ordensPorHoraMax: 2 };
    expect(rodar(doisSinais, { estrategia: venda, limites: frequencia }).barradasPelosLimites).toBe(1);
  });
});

describe("validação da entrada", () => {
  it("recusa estratégia inválida e janela vazia", () => {
    const c = pregao(DIA, "10:00", [parada(130_000)]);
    expect(() => rodar(c, { estrategia: { ...compra, stop: 0 } })).toThrow(/Estratégia inválida/);
    expect(() => rodar(c, { inicio: brasilia("2027-01-01", "10:00") })).toThrow(/não tem nenhum candle/);
  });
});

/* ---------- propriedades ---------- */

/** Espelha os preços em torno de C (múltiplo de 5): a máxima vira a mínima. */
const C = 260_000;
const espelhar = (cs: ReturnType<typeof serieWinIbov>) =>
  cs.map((c) =>
    velaWin(
      c.abertura,
      {
        o: C - c.abre.toNumber(),
        h: C - c.minima.toNumber(),
        l: C - c.maxima.toNumber(),
        c: C - c.fecha.toNumber(),
      } satisfies Vela,
      CINCO_MIN,
    ),
  );

const rompe = (comparador: "cruzouAcima" | "cruzouAbaixo", saida: "superior" | "inferior"): Regra => ({
  tipo: "comparar",
  esquerda: preco,
  comparador,
  direita: { tipo: "indicador", nome: "donchian", periodo: 12, saida },
});
const simetricas = {
  stop: 0.49,
  alvoLiquido: 0.99,
  taxa: 0,
  stopAtr: { periodo: 14, multiplo: 2 },
  stopMovel: { tipo: "atr", periodo: 14, multiplo: 3 },
  tempoMaximo: 20,
} as const;

describe(
  "propriedade: o vendido no gráfico espelhado dá o mesmo resultado que o comprado",
  { timeout: 60_000 },
  () => {
    it.each([5, 8, 13])(
      "semente %i: mesmas operações, mesmos contratos, mesmo resultado em reais",
      (semente) => {
        const dias = diasUteis("2026-08-03", 8);
        const original = serieWinIbov(semente, dias, 130_000, 0);
        const longa: Estrategia = { entrada: rompe("cruzouAcima", "superior"), ...simetricas };
        const curta: Estrategia = {
          entrada: nunca,
          direcao: "vendido",
          entradaVendida: rompe("cruzouAbaixo", "inferior"),
          ...simetricas,
        };
        const largo = { ...modelo, riscoPorOperacao: dec(2000) };
        const a = rodar(original, { estrategia: longa, modelo: largo });
        const b = rodar(espelhar(original), { estrategia: curta, modelo: largo });
        expect(a.operacoes.length).toBeGreaterThan(3);
        expect(b.operacoes.map((o) => [o.abertaEm, o.fechadaEm, o.contratos, o.motivo])).toEqual(
          a.operacoes.map((o) => [o.abertaEm, o.fechadaEm, o.contratos, o.motivo]),
        );
        expect(b.operacoes.map((o) => o.resultado.toString())).toEqual(
          a.operacoes.map((o) => o.resultado.toString()),
        );
        expect(b.resultadoLiquido.equals(a.resultadoLiquido)).toBe(true);
        expect(b.saidasIntrabar).toEqual(a.saidasIntrabar);
      },
    );

    it("determinístico: a mesma entrada dá o mesmo resultado", () => {
      const candles = serieWinIbov(21, diasUteis("2026-08-03", 5));
      const e = { estrategia: MODELOS_WIN[1]!.estrategia };
      expect(rodar(candles, e)).toEqual(rodar(candles, e));
    });
  },
);
