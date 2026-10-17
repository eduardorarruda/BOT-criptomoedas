import { MODELOS_WIN } from "@zentrade/dominio";
import { describe, expect, it } from "vitest";
import {
  comPadroesDoMercado,
  ConfiguracaoBacktestEsquema,
  ConfiguracaoWinEsquema,
  configuracaoWin,
  mercadoDo,
  MetricasBacktestEsquema,
  PedidoBacktestEsquema,
} from "./backtest.js";
import { EstrategiaEsquema, estrategiaDoDTO } from "./dados.js";

const DIA = 86_400_000;
const pedidoWin = {
  estrategiaId: "2b8f8a1e-7a51-4c6b-9a43-0e0b8f5f6a11",
  versao: 1,
  simbolo: "WIN-IBOV",
  intervalo: "5m",
  inicio: 0,
  fim: 90 * DIA,
  configuracao: { mercado: "win" },
};

describe("backtest no mini índice: o pedido", () => {
  it("padrões do modelo do WIN: tarifa R$ 0,25, 1 tick, 09:15–17:30, zeragem 18:15, margem R$ 155", () => {
    expect(ConfiguracaoWinEsquema.parse({})).toEqual({
      tarifaB3PorContrato: "0.25",
      corretagemPorContrato: "0",
      deslizamentoTicks: 1,
      inicioEntradas: "09:15",
      fimEntradas: "17:30",
      zeragem: "18:15",
      pularLeilaoAbertura: true,
      margemPorContrato: "155",
      contratosMaximos: 5,
      riscoPorOperacao: "50",
    });
  });

  it("sem mercado é cripto, como os backtests antigos; o WIN grava os padrões aplicados", () => {
    const cripto = ConfiguracaoBacktestEsquema.parse({});
    expect(mercadoDo(cripto)).toBe("cripto");
    expect(comPadroesDoMercado(cripto)).toBe(cripto);
    expect(cripto).not.toHaveProperty("mercado");
    const p = PedidoBacktestEsquema.parse(pedidoWin);
    expect(mercadoDo(p.configuracao)).toBe("win");
    expect(p.configuracao.win).toBeUndefined();
    const gravado = comPadroesDoMercado(p.configuracao);
    expect(gravado.win).toEqual(ConfiguracaoWinEsquema.parse({}));
    expect(configuracaoWin(p.configuracao)).toEqual(gravado.win);
  });

  it("aceita WIN-IBOV e WIN em 5m, 15m e 1h", () => {
    for (const simbolo of ["WIN-IBOV", "WIN"])
      for (const intervalo of ["5m", "15m", "1h"])
        expect(PedidoBacktestEsquema.safeParse({ ...pedidoWin, simbolo, intervalo }).success).toBe(true);
  });

  it("recusa símbolo de cripto no WIN, intervalo sem dados, precisão de 1 minuto e WIN no mercado de cripto", () => {
    const erros = (p: object) =>
      PedidoBacktestEsquema.safeParse({ ...pedidoWin, ...p }).error?.issues.map((i) => i.message) ?? [];
    expect(erros({ simbolo: "BTCUSDT" })[0]).toMatch(/WIN-IBOV \(aproximação pelo Ibovespa\) ou WIN/);
    expect(erros({ intervalo: "1d" })[0]).toMatch(/os intervalos são 5m, 15m, 1h/);
    expect(erros({ configuracao: { mercado: "win", precisaoMinuto: true }, fim: 10 * DIA })[0]).toMatch(
      /não há candles de 1 minuto/,
    );
    expect(erros({ configuracao: {} })[0]).toBe("símbolo como BTCUSDT");
    expect(erros({ simbolo: "win", configuracao: {} }).length).toBeGreaterThan(0);
  });

  it("recusa custos e horários fora das faixas", () => {
    const ok = (w: object) => ConfiguracaoWinEsquema.safeParse(w).success;
    expect(ok({ deslizamentoTicks: 3, corretagemPorContrato: "0.5" })).toBe(true);
    expect(ok({ deslizamentoTicks: -1 })).toBe(false);
    expect(ok({ deslizamentoTicks: 1.5 })).toBe(false);
    expect(ok({ tarifaB3PorContrato: "-0.1" })).toBe(false);
    expect(ok({ margemPorContrato: "0" })).toBe(false);
    expect(ok({ contratosMaximos: 0 })).toBe(false);
    expect(ok({ riscoPorOperacao: "0" })).toBe(false);
    expect(ok({ inicioEntradas: "9:15" })).toBe(false);
    const fora = ConfiguracaoWinEsquema.safeParse({ inicioEntradas: "18:00" });
    expect(fora.error?.issues[0]?.message).toBe(
      "o início das entradas precisa ser antes do corte das entradas",
    );
    expect(ok({ zeragem: "17:00" })).toBe(false);
  });
});

describe("estratégia com direção", () => {
  it("os modelos do WIN passam pelo esquema e voltam iguais ao domínio", () => {
    for (const m of MODELOS_WIN) {
      const dto = EstrategiaEsquema.parse({ id: m.id, nome: m.nome, versao: 1, ...m.estrategia });
      expect(estrategiaDoDTO(dto)).toEqual(m.estrategia);
    }
  });

  it("recusa direção desconhecida", () => {
    const [m] = MODELOS_WIN;
    expect(
      EstrategiaEsquema.safeParse({ id: "x", nome: "x", versao: 1, ...m!.estrategia, direcao: "lado" })
        .success,
    ).toBe(false);
  });
});

describe("métricas do WIN", () => {
  it("são opcionais (cripto e backtests antigos não têm) e validam quando vêm", () => {
    const base = {
      resultadoLiquido: "10",
      maiorQueda: "5",
      maiorQuedaPercentual: 0.01,
      operacoes: 1,
      acertos: 1,
      taxaAcerto: 1,
      taxasPagas: "0.5",
    };
    expect(MetricasBacktestEsquema.safeParse(base).success).toBe(true);
    const win = {
      simbolo: "WIN-IBOV",
      aproximacao: true,
      contratosNegociados: 2,
      operacoesCompradas: 1,
      operacoesVendidas: 0,
      resultadoComprado: "10",
      resultadoVendido: "0",
      pontosBrutos: "65",
      pontosLiquidos: "50",
      resultadoPorContrato: "5",
      pontosPorContrato: "25",
      custosB3: "1",
      corretagem: "0",
      deslizamentoPago: "2",
      deslizamentoPontos: "10",
      custosSobreBruto: 0.23,
      irEstimado: "2",
      irrfInformativo: "0.1",
      prejuizoACompensar: "0",
      liquidoDepoisDoIr: "8",
      meses: [
        {
          mes: "2026-10",
          resultado: "10",
          prejuizoAntes: "0",
          compensado: "0",
          base: "10",
          ir: "2",
          irrf: "0.1",
          prejuizoDepois: "0",
        },
      ],
      zeragens: 1,
      semEspacoNoRisco: 0,
      barradasPelosLimites: 0,
      dias: 1,
      sessao: { resultado: "-3", resultadoPercentual: -0.0006 },
    };
    expect(MetricasBacktestEsquema.safeParse({ ...base, win }).success).toBe(true);
    expect(
      MetricasBacktestEsquema.safeParse({ ...base, win: { ...win, contratosNegociados: -1 } }).success,
    ).toBe(false);
  });
});
