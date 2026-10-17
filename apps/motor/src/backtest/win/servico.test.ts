import type { BacktestParaRodar, CandleDTO, ResultadoBacktestGravado } from "@zentrade/banco";
import {
  BacktestEsquema,
  ConfiguracaoBacktestEsquema,
  MetricasBacktestEsquema,
  ValidacaoBacktestEsquema,
  type ConfiguracaoBacktestEntrada,
} from "@zentrade/contratos";
import { PapelCorretora } from "@zentrade/corretora";
import { dec, MODELOS_WIN, paraTexto, type Candle, type Estrategia } from "@zentrade/dominio";
import { describe, expect, it } from "vitest";
import { registroDeTeste } from "../../teste/cenario.js";
import { brasilia, diasUteis, serieWinIbov } from "../../teste/win.js";
import { processarBacktest, type RepositorioBacktestsDoMotor } from "../servico.js";
import { AVISO_APROXIMACAO } from "./servico.js";

/** 60 pregões de WIN-IBOV em 5 minutos; o backtest roda nos 50 últimos (os 10 primeiros aquecem). */
const DIAS = diasUteis("2026-06-01", 60);
const CANDLES = serieWinIbov(42, DIAS);
const INICIO = brasilia(DIAS[10]!, "00:00");
const FIM = brasilia(DIAS[59]!, "23:00");

const paraDTO = (c: Candle): CandleDTO => ({
  abertura: c.abertura,
  abre: paraTexto(c.abre),
  maxima: paraTexto(c.maxima),
  minima: paraTexto(c.minima),
  fecha: paraTexto(c.fecha),
  volume: paraTexto(c.volume),
});

const pedido = (
  estrategia: Estrategia,
  configuracao: ConfiguracaoBacktestEntrada = { mercado: "win" },
  simbolo = "WIN-IBOV",
): BacktestParaRodar => ({
  id: "w1",
  estrategiaId: "e1",
  versao: 1,
  simbolo,
  intervalo: "5m",
  inicio: INICIO,
  fim: FIM,
  estado: "rodando",
  metricas: null,
  curva: null,
  erro: null,
  criadoEm: 0,
  concluidoEm: null,
  configuracao: ConfiguracaoBacktestEsquema.parse(configuracao),
  validacao: null,
  estrategia,
});

/**
 * As candles do WIN vêm do banco (o contrato de dados): o repositório falso responde
 * por página, como o de verdade. A corretora de papel também as tem, para o caso de o
 * carregador ainda tentar a corretora quando o banco não cobre a janela.
 */
function montar(p: BacktestParaRodar, candles: readonly Candle[] = CANDLES) {
  const papel = new PapelCorretora({ saldos: {}, taxa: 0, deslizamentoBps: 0 });
  candles.forEach((c) => papel.alimentar(p.simbolo, "5m", c));
  const banco = {
    candles: async (c: { simbolo: string; inicio: number; fim: number }) =>
      c.simbolo === p.simbolo
        ? candles
            .filter((k) => k.abertura >= c.inicio && k.abertura < c.fim)
            .slice(0, 1000)
            .map(paraDTO)
        : [],
    gravar: async () => undefined,
  };
  const gravado: { concluido?: ResultadoBacktestGravado; falhou?: string } = {};
  const backtests: RepositorioBacktestsDoMotor = {
    paraRodar: async () => p,
    concluir: async (_id, r) => void (gravado.concluido = r),
    falhar: async (_id, erro) => void (gravado.falhou = erro),
  };
  const { registro } = registroDeTeste();
  const deps = { backtests, fontes: { banco, corretora: papel }, registro };
  return { deps, opcoes: { saldoInicial: dec(1000), riscoPorOperacao: 0.01 }, gravado };
}

const [FAIXA, EMA_ADX] = MODELOS_WIN;

/** Cada rodada passa por 4.800 candles com indicadores de 500 candles de histórico, como o robô. */
const LENTO = { timeout: 60_000 };

describe("backtest do mini índice, de ponta a ponta (WIN-IBOV determinístico)", LENTO, () => {
  it("roda o modelo do WIN e grava métricas em reais e pontos, IR, referência e a validação", async () => {
    const m = montar(pedido(EMA_ADX!.estrategia));
    expect(await processarBacktest(m.deps, m.opcoes, "w1")).toBe("concluido");
    const g = m.gravado.concluido!;
    const metricas = MetricasBacktestEsquema.parse(g.metricas);
    const validacao = ValidacaoBacktestEsquema.parse(g.validacao);
    const w = metricas.win!;
    expect(w.simbolo).toBe("WIN-IBOV");
    expect(w.aproximacao).toBe(true);
    expect(metricas.operacoes).toBeGreaterThan(5);
    expect(w.operacoesCompradas + w.operacoesVendidas).toBe(metricas.operacoes);
    expect(w.operacoesCompradas).toBeGreaterThan(0);
    expect(w.operacoesVendidas).toBeGreaterThan(0);
    // capital padrão do WIN (R$ 5.000), não o do cripto
    expect(metricas.saldoInicial).toBe("5000");
    expect(metricas.riscoPorOperacao).toBe("100");
    // as contas fecham: bruto − tarifas − deslizamento = líquido; pontos = reais ÷ 0,20
    const bruto = dec(metricas.resultadoBruto!);
    const liquido = dec(metricas.resultadoLiquido);
    expect(bruto.minus(w.custosB3).minus(w.corretagem).minus(w.deslizamentoPago).equals(liquido)).toBe(true);
    expect(dec(w.pontosLiquidos).times("0.2").equals(liquido)).toBe(true);
    expect(dec(w.resultadoComprado).plus(w.resultadoVendido).equals(liquido)).toBe(true);
    expect(dec(metricas.taxasPagas).equals(dec(w.custosB3).plus(w.corretagem))).toBe(true);
    // R$ 0,25 por contrato por lado: tarifas = 0,50 × contratos negociados
    expect(dec(w.custosB3).equals(dec("0.5").times(w.contratosNegociados))).toBe(true);
    expect(dec(w.liquidoDepoisDoIr).equals(liquido.minus(w.irEstimado))).toBe(true);
    expect(w.meses.length).toBeGreaterThanOrEqual(2);
    expect(w.dias).toBe(50);
    // a referência da sessão está na curva, onde o cripto põe o buy and hold
    const curva = g.curva as { buyHold?: string }[];
    expect(curva.every((p) => p.buyHold !== undefined)).toBe(true);
    // a validação de sempre, mais o aviso da aproximação
    expect(validacao.amostra).not.toBeNull();
    expect(validacao.walkForward?.janelas.length).toBe(5);
    expect(validacao.avisos.map((a) => a.mensagem)).toContain(AVISO_APROXIMACAO);
    // anualizado pelos candles do pregão (≈ 252 × 96), não por 365 × 24 h
    expect(metricas.barrasPorAno).toBeGreaterThan(20_000);
    expect(metricas.barrasPorAno).toBeLessThan(30_000);
    // o backtest lido pela API passa no contrato
    expect(
      BacktestEsquema.safeParse({
        ...pedido(EMA_ADX!.estrategia),
        estado: "concluido",
        metricas: g.metricas,
        curva: g.curva,
        validacao: g.validacao,
      }).success,
    ).toBe(true);
  });

  it("é determinístico: duas rodadas gravam exatamente o mesmo", async () => {
    const a = montar(pedido(FAIXA!.estrategia));
    const b = montar(pedido(FAIXA!.estrategia));
    await processarBacktest(a.deps, a.opcoes, "w1");
    await processarBacktest(b.deps, b.opcoes, "w1");
    expect(a.gravado.concluido).toEqual(b.gravado.concluido);
  });

  it("WIN de verdade (dados importados): sem o aviso de aproximação; custos e saldo do pedido valem", async () => {
    const config: ConfiguracaoBacktestEntrada = {
      mercado: "win",
      saldoInicial: "20000",
      risco: { modo: "sem_limites" },
      win: { deslizamentoTicks: 2, corretagemPorContrato: "0.5", riscoPorOperacao: "200" },
    };
    const m = montar(pedido(EMA_ADX!.estrategia, config, "WIN"));
    expect(await processarBacktest(m.deps, m.opcoes, "w1")).toBe("concluido");
    const metricas = MetricasBacktestEsquema.parse(m.gravado.concluido!.metricas);
    const avisos = ValidacaoBacktestEsquema.parse(m.gravado.concluido!.validacao).avisos;
    expect(metricas.win?.aproximacao).toBe(false);
    expect(avisos.map((a) => a.codigo)).not.toContain("aproximacao_ibov");
    expect(avisos.map((a) => a.codigo)).toContain("sem_limites");
    expect(metricas.saldoInicial).toBe("20000");
    const w = metricas.win!;
    expect(dec(w.corretagem).equals(dec(1).times(w.contratosNegociados))).toBe(true);
  });

  it("sem candles do WIN no banco: falha com a mensagem para a pessoa", async () => {
    const m = montar(pedido(FAIXA!.estrategia), []);
    expect(await processarBacktest(m.deps, m.opcoes, "w1")).toBe("falhou");
    expect(m.gravado.falhou).toMatch(/não tem nenhum candle/);
  });
});

describe("cripto continua só comprado", LENTO, () => {
  it("estratégia vendida no backtest de cripto falha com a explicação", async () => {
    const p = { ...pedido(FAIXA!.estrategia, {}), simbolo: "BTCUSDT", intervalo: "1h" as const };
    const m = montar(p);
    expect(await processarBacktest(m.deps, m.opcoes, "w1")).toBe("falhou");
    expect(m.gravado.falhou).toMatch(/à vista de cripto só opera comprado/);
  });
});
