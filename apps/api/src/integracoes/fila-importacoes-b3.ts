import { Queue } from "bullmq";
import type { Redis } from "ioredis";
import type { FilaImportacoesB3 } from "../dependencias.js";

export const FILA_IMPORTACOES_B3 = "importacoes-b3";

/**
 * API → motor (processo motor-backtests, como os backtests): o job leva só o id; o
 * motor lê o caminho do .zip temporário no banco e grava o resumo (ou o erro) lá.
 */
export function criarFilaImportacoesB3(conexao: Redis): FilaImportacoesB3 & { fechar(): Promise<void> } {
  const fila = new Queue(FILA_IMPORTACOES_B3, { connection: conexao });
  return {
    async adicionar(importacaoId) {
      // jobId = importacaoId: reenviar o mesmo pedido não cria segundo job.
      await fila.add(
        "importacao-b3",
        { importacaoId },
        { jobId: importacaoId, removeOnComplete: 1000, removeOnFail: 5000 },
      );
    },
    fechar: () => fila.close(),
  };
}

export const FILA_ATUALIZACOES_MT5 = "atualizacoes-mt5";

/** Botão "Atualizar dados do WIN": o job leva só o id da linha de `importacoes_b3`. */
export function criarFilaAtualizacoesMt5(conexao: Redis): FilaImportacoesB3 & { fechar(): Promise<void> } {
  const fila = new Queue(FILA_ATUALIZACOES_MT5, { connection: conexao });
  return {
    async adicionar(importacaoId) {
      await fila.add(
        "atualizacao-mt5",
        { importacaoId },
        { jobId: importacaoId, removeOnComplete: 1000, removeOnFail: 5000 },
      );
    },
    fechar: () => fila.close(),
  };
}
