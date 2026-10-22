import type { BacktestParaRodar, ResultadoBacktestGravado } from "@zentrade/banco";
import { PapelCorretora } from "@zentrade/corretora";
import { dec, MODELOS, type Candle } from "@zentrade/dominio";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { registroDeTeste } from "../teste/cenario.js";
import { processarBacktest, type RepositorioBacktestsDoMotor } from "./servico.js";

/**
 * Regressão do cripto: o mini índice mexeu no domínio (sentido nas contas de stop e alvo,
 * instantes no contexto) e no serviço de backtest. Os backtests de cripto precisam dar
 * EXATAMENTE o que davam antes. As impressões abaixo foram tiradas rodando este mesmo
 * arquivo no commit anterior ao mini índice (9bff301); mudou um dígito, falha.
 */
const H = 3_600_000;
const INICIO = Date.UTC(2026, 0, 1);

/** 900 candles de 1 h com tendência, ciclos e ruído determinístico. */
const CANDLES: Candle[] = Array.from({ length: 900 }, (_, i) => {
  const base = 100 + i * 0.02 + 6 * Math.sin(i / 17) + 3 * Math.sin(i / 5.3);
  const ruido = ((i * 7919) % 101) / 101 - 0.5;
  const fecha = Math.round((base + ruido) * 100) / 100;
  const abre = Math.round((fecha - ruido * 0.6) * 100) / 100;
  return {
    abertura: INICIO + i * H,
    fechamento: INICIO + (i + 1) * H - 1,
    abre: dec(abre),
    maxima: dec(Math.max(abre, fecha) + 0.4 + ((i * 31) % 7) / 10),
    minima: dec(Math.min(abre, fecha) - 0.4 - ((i * 17) % 5) / 10),
    fecha: dec(fecha),
    volume: dec(100 + ((i * 37) % 90)),
  };
});

async function rodar(estrategia: BacktestParaRodar["estrategia"]): Promise<ResultadoBacktestGravado> {
  const papel = new PapelCorretora({ saldos: {}, taxa: 0, deslizamentoBps: 0 });
  CANDLES.forEach((c) => papel.alimentar("BTCUSDT", "1h", c));
  let gravado: ResultadoBacktestGravado | undefined;
  const p: BacktestParaRodar = {
    id: "r1",
    usuarioId: "u1",
    estrategiaId: "e1",
    versao: 1,
    simbolo: "BTCUSDT",
    intervalo: "1h",
    inicio: INICIO + 250 * H,
    fim: INICIO + 900 * H,
    estado: "rodando",
    metricas: null,
    curva: null,
    erro: null,
    criadoEm: 0,
    concluidoEm: null,
    configuracao: null,
    validacao: null,
    estrategia,
  };
  const backtests: RepositorioBacktestsDoMotor = {
    paraRodar: async () => p,
    concluir: async (_id, r) => void (gravado = r),
    falhar: async (_id, erro) => {
      throw new Error(erro);
    },
  };
  const deps = { backtests, fontes: { corretora: papel }, registro: registroDeTeste().registro };
  await processarBacktest(deps, { saldoInicial: dec(1000), riscoPorOperacao: 0.01 }, "r1");
  if (!gravado) throw new Error("o backtest não gravou nada");
  return gravado;
}

const impressao = (r: ResultadoBacktestGravado): string =>
  createHash("sha256").update(JSON.stringify(r)).digest("hex").slice(0, 16);

const ANTES: Record<string, string> = {
  "donchian-20-10": "e47aa11f158fb04a",
  "ema-9-21-adx": "566832a834612378",
  "bollinger-sma200": "b12c59d58aa83e23",
  "macd-momento": "46456aa49129ef65",
  "rsi2-tendencia": "a821735fb01b4666",
};

describe("regressão: backtests de cripto iguais aos de antes do mini índice", { timeout: 60_000 }, () => {
  // Só os modelos que já existiam: os novos (cofre) têm o seu próprio teste, sem impressão antiga.
  it.each(MODELOS.filter((m) => m.id in ANTES).map((m) => [m.id, m] as const))(
    "%s grava exatamente o mesmo resultado",
    async (id, m) => {
      const r = await rodar(m.estrategia);
      expect((r.metricas as { operacoes: number }).operacoes).toBeGreaterThan(0);
      expect(impressao(r)).toBe(ANTES[id]);
    },
  );
});
