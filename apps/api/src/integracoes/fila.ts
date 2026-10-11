import { Queue } from "bullmq";
import type { Redis } from "ioredis";
import type { FilaBacktests } from "../dependencias.js";

export const FILA_BACKTESTS = "backtests";

/** API → motor: o job leva só o id; o motor lê o pedido no banco e grava o resultado lá. */
export function criarFilaBacktests(conexao: Redis): FilaBacktests & { fechar(): Promise<void> } {
  const fila = new Queue(FILA_BACKTESTS, { connection: conexao });
  return {
    async adicionar(backtestId) {
      // jobId = backtestId: reenviar o mesmo pedido não cria segundo job.
      await fila.add(
        "backtest",
        { backtestId },
        { jobId: backtestId, removeOnComplete: 1000, removeOnFail: 5000 },
      );
    },
    fechar: () => fila.close(),
  };
}
