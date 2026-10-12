import { Queue } from "bullmq";
import { dec } from "@zentrade/dominio";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { consumirBacktests, FILA_BACKTESTS } from "../backtest/fila.js";
import { processarBacktest } from "../backtest/servico.js";
import { serie } from "../teste/candles.js";
import { ate, montarAmbiente, registro, type AmbienteIntegracao } from "./ajuda.js";

const H = 3_600_000;
const INICIO = Date.UTC(2026, 0, 10);
/** Cai abaixo de 95 (compra) e sobe acima do alvo (vende): uma ida e volta com lucro. */
const PRECOS = [...Array<number>(230).fill(100), 94, 94, 96, 97, 98, ...Array<number>(20).fill(98)];

describe("fila de backtests (BullMQ + PostgreSQL)", () => {
  let a: AmbienteIntegracao;
  let fila: Queue;

  beforeAll(async () => {
    a = await montarAmbiente();
    fila = new Queue(FILA_BACKTESTS, { connection: a.redis });
    await fila.obliterate({ force: true });
    await a.banco.mercado.gravar("BTCUSDT", "1h", serie(INICIO, PRECOS, H));
  });
  afterAll(async () => {
    await fila.close();
    await a.encerrar();
  });

  it("consome o job, roda o backtest com os candles do banco e grava métricas e curva", async () => {
    const r = registro();
    const semRede = {
      candles: () => Promise.reject(new Error("não deveria ir à corretora: os candles estão no banco")),
    };
    const deps = {
      backtests: a.motorBanco.backtests,
      fontes: { banco: a.motorBanco.mercado, corretora: semRede },
      registro: r.registro,
    };
    const consumidor = consumirBacktests(
      a.redis,
      (id) => processarBacktest(deps, { saldoInicial: dec(1000), riscoPorOperacao: 0.01 }, id),
      r.registro,
    );
    try {
      const { id } = await a.banco.backtests.criar(a.usuarioId, {
        estrategiaId: a.estrategiaId,
        versao: 1,
        simbolo: "BTCUSDT",
        intervalo: "1h",
        inicio: INICIO + 200 * H,
        fim: INICIO + PRECOS.length * H,
      });
      await fila.add("backtest", { backtestId: id }, { jobId: id });
      await fila.add("backtest", { backtestId: "nao-e-uuid" }, { jobId: "invalido" });
      const b = await ate(
        () => a.banco.backtests.obter(a.usuarioId, id),
        (x) => x?.estado === "concluido" || x?.estado === "falhou",
      );
      expect(b?.erro).toBeNull();
      expect(b?.estado).toBe("concluido");
      expect(b?.metricas).toMatchObject({ operacoes: 1, acertos: 1, taxaAcerto: 1, saldoInicial: "1000" });
      const metricas = b?.metricas as { resultadoLiquido: string; maiorQuedaPercentual: number };
      expect(dec(metricas.resultadoLiquido).gt(0)).toBe(true);
      expect(typeof metricas.maiorQuedaPercentual).toBe("number");
      const curva = b?.curva as { em: number; patrimonio: string }[];
      expect(curva.length).toBe(PRECOS.length - 200);
      expect(curva[0]?.patrimonio).toBe("1000");
      // Custos padrão, buy and hold e validação gravados e lidos pelo contrato.
      expect(b?.metricas?.deslizamentoPago).toMatch(/^\d/);
      expect(typeof b?.metricas?.buyHoldResultadoPercentual).toBe("number");
      expect(curva[0]).toHaveProperty("buyHold");
      expect(b?.validacao?.walkForward?.janelas).toHaveLength(5);
      expect(b?.validacao?.amostra?.fracaoDentro).toBe(0.7);
      await ate(
        async () => r.erros.map((e) => e.msg),
        (m) => m.some((x) => /job de backtest falhou/.test(x)),
      );
      expect(r.erros.some((e) => /job de backtest falhou/.test(e.msg))).toBe(true);
    } finally {
      await consumidor.fechar();
    }
  });
});
