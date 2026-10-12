import { describe, expect, it } from "vitest";
import {
  BacktestEsquema,
  ConfiguracaoBacktestEsquema,
  LIMITES_BACKTEST_PADRAO,
  PedidoBacktestEsquema,
  TAXA_BINANCE_BNB,
  TAXA_BINANCE_VIP0,
  ValidacaoBacktestEsquema,
  limitesPadraoDoBacktest,
} from "./backtest.js";

const DIA = 86_400_000;
const pedido = {
  estrategiaId: "2b8f8a1e-7a51-4c6b-9a43-0e0b8f5f6a11",
  versao: 1,
  simbolo: "BTCUSDT",
  intervalo: "1h",
  inicio: 0,
  fim: 90 * DIA,
};

const trecho = {
  inicio: 0,
  fim: 10,
  retorno: 0.02,
  sharpe: 1.1,
  maiorQuedaPercentual: 0.03,
  operacoes: 4,
  taxaAcerto: 0.5,
  buyHoldRetorno: 0.01,
};

describe("configuração do backtest", () => {
  it("sem configuração: custos realistas, limites do robô e validação 70/30", () => {
    const p = PedidoBacktestEsquema.parse(pedido);
    expect(p.configuracao).toEqual({
      custos: { taxaPorLado: TAXA_BINANCE_VIP0, deslizamentoBps: 5, meioSpreadBps: 2 },
      risco: { modo: "robo" },
      precisaoMinuto: false,
      validacao: {
        fracaoDentroDaAmostra: 0.7,
        janelas: 5,
        modoJanelas: "rolante",
        simulacoes: 1000,
        semente: 42,
        limiteRuina: 0.3,
      },
    });
  });

  it("aceita taxa com BNB, sem limites e limites copiados de um robô", () => {
    const c = ConfiguracaoBacktestEsquema.parse({
      custos: { taxaPorLado: TAXA_BINANCE_BNB },
      risco: { modo: "sem_limites" },
    });
    expect(c.custos).toEqual({ taxaPorLado: 0.00075, deslizamentoBps: 5, meioSpreadBps: 2 });
    expect(c.risco).toEqual({ modo: "sem_limites" });
    const limites = {
      perdaDiariaMaxima: "20",
      exposicaoMaxima: "300",
      riscoPorOperacao: "5",
      ordensPorHoraMax: 4,
      pausaAposPerdaMin: 60,
      confiancaMinima: 0.65,
    };
    expect(ConfiguracaoBacktestEsquema.parse({ risco: { modo: "robo", limites } }).risco).toEqual({
      modo: "robo",
      limites,
    });
  });

  it("recusa custos absurdos, saldo zero e divisão fora de 50–90%", () => {
    const ruim = (c: unknown) => ConfiguracaoBacktestEsquema.safeParse(c).success;
    expect(ruim({ custos: { deslizamentoBps: -1 } })).toBe(false);
    expect(ruim({ custos: { taxaPorLado: 0.02 } })).toBe(false);
    expect(ruim({ saldoInicial: "0" })).toBe(false);
    expect(ruim({ saldoInicial: "500" })).toBe(true);
    expect(ruim({ validacao: { fracaoDentroDaAmostra: 0.95 } })).toBe(false);
    expect(ruim({ validacao: { simulacoes: 10 } })).toBe(false);
    expect(ruim({ risco: { modo: "qualquer" } })).toBe(false);
  });

  it("precisão de 1 minuto só em períodos de até 31 dias (o download custa caro)", () => {
    const curto = { ...pedido, fim: 31 * DIA, configuracao: { precisaoMinuto: true } };
    expect(PedidoBacktestEsquema.safeParse(curto).success).toBe(true);
    const longo = { ...curto, fim: 32 * DIA };
    const r = PedidoBacktestEsquema.safeParse(longo);
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toMatch(/31 dias/);
  });

  it("limites padrão: os de um robô novo, proporcionais ao saldo", () => {
    expect(limitesPadraoDoBacktest("1000")).toEqual({
      perdaDiariaMaxima: "20",
      exposicaoMaxima: "300",
      riscoPorOperacao: "5",
      ordensPorHoraMax: LIMITES_BACKTEST_PADRAO.ordensPorHoraMax,
      pausaAposPerdaMin: 60,
      confiancaMinima: 0.65,
    });
    expect(limitesPadraoDoBacktest("250").riscoPorOperacao).toBe("1.25");
  });
});

describe("resultado do backtest", () => {
  const base = {
    id: "b1",
    estado: "concluido",
    estrategiaId: "e1",
    versao: 1,
    simbolo: "BTCUSDT",
    intervalo: "1h",
    inicio: 1,
    fim: 2,
    metricas: {
      resultadoLiquido: "-3.2",
      maiorQueda: "12.5",
      maiorQuedaPercentual: 0.0125,
      operacoes: 4,
      acertos: 1,
      taxaAcerto: 0.25,
      taxasPagas: "1.9",
    },
    curva: [{ em: 1, patrimonio: "1000" }],
    erro: null,
    criadoEm: 1,
    concluidoEm: 2,
  };

  it("backtest antigo (sem configuração, validação nem tentativas) continua válido", () => {
    expect(BacktestEsquema.safeParse(base).success).toBe(true);
  });

  it("backtest novo traz métricas de risco, buy and hold, validação e tentativas", () => {
    const novo = {
      ...base,
      metricas: {
        ...base.metricas,
        resultadoBruto: "1.1",
        resultadoBrutoPercentual: 0.0011,
        deslizamentoPago: "0.7",
        cagr: null,
        volatilidadeAnual: 0.4,
        sharpe: 0.8,
        sortino: 1.2,
        calmar: null,
        duracaoMaiorQuedaMs: 3_600_000,
        maiorQuedaRecuperada: false,
        fatorLucro: 0.6,
        expectativa: "-0.8",
        ganhoMedio: "2",
        perdaMedia: "-1.73",
        payoff: 1.15,
        tempoExposto: 0.3,
        buyHoldResultadoPercentual: 0.05,
        buyHoldMaiorQuedaPercentual: 0.2,
        buyHoldSharpe: 0.9,
        excessoSobreBuyHold: -0.0532,
        observacoes: 2160,
        barrasPorAno: 8760,
        assimetria: -0.4,
        curtose: 9,
        anos: 0.25,
        stopsIntrabar: 2,
        alvosIntrabar: 1,
        candlesAmbiguos: 1,
        precisaoMinuto: false,
      },
      curva: [{ em: 1, patrimonio: "1000", buyHold: "998.6" }],
      configuracao: ConfiguracaoBacktestEsquema.parse({}),
      validacao: {
        amostra: { fracaoDentro: 0.7, corte: 5, dentro: trecho, fora: trecho, degradou: false, motivo: null },
        walkForward: {
          modo: "rolante",
          janelas: [{ indice: 0, dentro: trecho, fora: trecho, eficiencia: 1 }],
          estabilidade: {
            mediaRetorno: 0.02,
            desvioRetorno: 0,
            mediaSharpe: 1.1,
            desvioSharpe: 0,
            fracaoPositivas: 1,
            eficienciaMedia: 1,
          },
        },
        monteCarlo: {
          simulacoes: 1000,
          semente: 42,
          limiteRuina: 0.3,
          operacoes: 4,
          retornoFinal: { p5: -0.1, p50: 0, p95: 0.1 },
          maiorQueda: { p5: 0.01, p50: 0.05, p95: 0.2 },
          probabilidadeRuina: 0.01,
          histograma: [{ de: -0.1, ate: 0.1, quantidade: 1000 }],
          leque: [{ operacao: 0, p5: 0, p50: 0, p95: 0 }],
        },
        avisos: [{ codigo: "poucas_operacoes", nivel: "alerta", base: "heuristica", mensagem: "Só 4." }],
      },
      tentativas: {
        total: 3,
        daVersao: 2,
        versoes: 2,
        probabilidadeSharpe: 0.8,
        sharpeDeflacionado: 0.4,
        sharpeMaximoEsperado: 1.2,
        anosMinimos: 3.1,
        sharpeComDesconto: 0.2,
      },
    };
    const r = BacktestEsquema.safeParse(novo);
    expect(r.error?.issues).toBeUndefined();
    expect(r.success).toBe(true);
  });

  it("validação recusa nível ou base de aviso desconhecidos", () => {
    const v = { amostra: null, walkForward: null, monteCarlo: null, avisos: [] };
    expect(ValidacaoBacktestEsquema.safeParse(v).success).toBe(true);
    const aviso = { codigo: "x", nivel: "grave", base: "formal", mensagem: "?" };
    expect(ValidacaoBacktestEsquema.safeParse({ ...v, avisos: [aviso] }).success).toBe(false);
  });
});
