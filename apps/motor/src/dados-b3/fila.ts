import { Worker, type ConnectionOptions } from "bullmq";
import { z } from "zod";
import type { Registro } from "../nucleo/tipos.js";

/** Mesmo nome que a API usa ao enfileirar (apps/api/src/integracoes/fila-importacoes-b3.ts). */
export const FILA_IMPORTACOES_B3 = "importacoes-b3";

/** Mesmo nome que a API usa ao enfileirar a atualização do WIN pelo MetaTrader 5. */
export const FILA_ATUALIZACOES_MT5 = "atualizacoes-mt5";

const JobImportacaoB3 = z.object({ importacaoId: z.uuid() });

/** O .zip tem até 560 MB descompactados: o mesmo teto de trava dos backtests. */
export const DURACAO_TRAVA_MS = 30 * 60_000;

export interface ConsumidorImportacoesB3 {
  fechar(): Promise<void>;
}

function consumir(
  nomeFila: string,
  rotulo: string,
  conexao: ConnectionOptions,
  processar: (importacaoId: string) => Promise<unknown>,
  registro: Registro,
): ConsumidorImportacoesB3 {
  const worker = new Worker(
    nomeFila,
    async (job) => {
      const dados = JobImportacaoB3.safeParse(job.data);
      if (!dados.success) throw new Error(`Job de ${rotulo} inválido: esperado { importacaoId: uuid }.`);
      return processar(dados.data.importacaoId);
    },
    { connection: conexao, concurrency: 1, lockDuration: DURACAO_TRAVA_MS },
  );
  worker.on("failed", (job, erro) =>
    registro.error({ erro, jobId: job?.id }, `job de ${rotulo} falhou (a fila pode tentar de novo)`),
  );
  worker.on("error", (erro) => registro.error({ erro }, `consumidor da fila de ${rotulo} com problema`));
  return { fechar: () => worker.close() };
}

/**
 * Consome a fila BullMQ `importacoes-b3` (um job por vez: é CPU e memória, como os
 * backtests, no mesmo processo motor-backtests). O job leva só o id; o caminho do
 * .zip está no banco.
 */
export const consumirImportacoesB3 = (
  conexao: ConnectionOptions,
  processar: (importacaoId: string) => Promise<unknown>,
  registro: Registro,
): ConsumidorImportacoesB3 => consumir(FILA_IMPORTACOES_B3, "importação B3", conexao, processar, registro);

/** Consome `atualizacoes-mt5`: o botão "Atualizar dados do WIN" (as credenciais ficam no banco). */
export const consumirAtualizacoesMt5 = (
  conexao: ConnectionOptions,
  processar: (importacaoId: string) => Promise<unknown>,
  registro: Registro,
): ConsumidorImportacoesB3 =>
  consumir(FILA_ATUALIZACOES_MT5, "atualização MT5", conexao, processar, registro);
