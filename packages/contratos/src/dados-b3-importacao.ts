import { z } from "zod";
import { Id, Instante } from "./comum.js";

/**
 * Upload dos .zip "Negócio a negócio" baixados à mão no BDI da B3 (o sistema nunca
 * baixa nada de arquivos.b3.com.br: a B3 proíbe coleta automatizada das páginas do
 * BDI). A API só recebe o arquivo e enfileira; o motor processa (reusa
 * executarImportacaoNegocios de apps/motor/src/dados-b3) e grava o resumo aqui.
 */
export const EstadoImportacaoB3 = z.enum(["na_fila", "lendo", "concluida", "falhou"]);
export type EstadoImportacaoB3 = z.infer<typeof EstadoImportacaoB3>;

/** O .zip da B3 (~60 MB comprimido) mais folga; acima disso não é o arquivo esperado. */
export const LIMITE_ZIP_B3_BYTES = 150 * 1024 * 1024;

export const ResumoDiaImportacaoB3Esquema = z.object({
  data: z.string(),
  contrato: z.string(),
  negocios: z.number().int().nonnegative(),
  negociosUsados: z.number().int().nonnegative(),
  gravados: z.record(z.string(), z.number().int().nonnegative()),
});
export type ResumoDiaImportacaoB3 = z.infer<typeof ResumoDiaImportacaoB3Esquema>;

export const ResumoImportacaoB3Esquema = z.object({
  dias: z.array(ResumoDiaImportacaoB3Esquema),
});
export type ResumoImportacaoB3 = z.infer<typeof ResumoImportacaoB3Esquema>;

export const ImportacaoB3Esquema = z.object({
  id: Id,
  nomeArquivo: z.string(),
  estado: EstadoImportacaoB3,
  resumo: ResumoImportacaoB3Esquema.nullable(),
  erro: z.string().nullable(),
  criadoEm: Instante,
  concluidoEm: Instante.nullable(),
});
export type ImportacaoB3DTO = z.infer<typeof ImportacaoB3Esquema>;
