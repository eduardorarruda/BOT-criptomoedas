import { Worker, type ConnectionOptions } from "bullmq";
import { z } from "zod";
import type { Registro } from "../nucleo/tipos.js";

/** Mesmo nome que a API usa ao enfileirar (apps/api/src/integracoes/fila.ts). */
export const FILA_BACKTESTS = "backtests";

const JobBacktest = z.object({ backtestId: z.uuid() });

export const DURACAO_TRAVA_MS = 30 * 60_000;

export interface ConsumidorBacktests {
  fechar(): Promise<void>;
}

/**
 * Consome a fila BullMQ `backtests` (um job por vez: backtest é CPU). O job leva só o
 * id; o resto está no banco. Falha do job vai para o registro; a fila decide se tenta de novo.
 */
export function consumirBacktests(
  conexao: ConnectionOptions,
  processar: (backtestId: string) => Promise<unknown>,
  registro: Registro,
): ConsumidorBacktests {
  const worker = new Worker(
    FILA_BACKTESTS,
    async (job) => {
      const dados = JobBacktest.safeParse(job.data);
      if (!dados.success) throw new Error(`Job de backtest inválido: esperado { backtestId: uuid }.`);
      return processar(dados.data.backtestId);
    },
    // Um backtest longo segura o processo por minutos e a trava não seria renovada a tempo:
    // com 30 min, o job não é dado como perdido (e refeito) no meio do cálculo.
    { connection: conexao, concurrency: 1, lockDuration: DURACAO_TRAVA_MS },
  );
  worker.on("failed", (job, erro) =>
    registro.error({ erro, jobId: job?.id }, "job de backtest falhou (a fila pode tentar de novo)"),
  );
  worker.on("error", (erro) => registro.error({ erro }, "consumidor da fila de backtests com problema"));
  return { fechar: () => worker.close() };
}
