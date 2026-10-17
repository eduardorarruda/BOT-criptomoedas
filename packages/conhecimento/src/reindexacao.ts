import type { Embeddings } from "./embeddings/tipos.js";
import { textoParaEmbedding } from "./ingestao.js";
import { ErroConhecimento } from "./tipos.js";

/** Um trecho gravado sem vetor (ingerido com EMBEDDINGS_PROVEDOR=nenhum). */
export interface TrechoSemVetor {
  readonly id: string;
  readonly titulo: string;
  readonly texto: string;
}

export interface VetorDoTrecho {
  readonly id: string;
  readonly embedding: readonly number[];
}

/** O que a reindexação precisa do banco. A implementação real (sob RLS) está em @zentrade/banco. */
export interface RepositorioReindexacao {
  pessoasComTrechosSemVetor(): Promise<string[]>;
  contarTrechosSemVetor(usuarioId: string): Promise<number>;
  /** Os próximos `limite` trechos sem vetor, sempre na mesma ordem. */
  trechosSemVetor(usuarioId: string, limite: number): Promise<TrechoSemVetor[]>;
  /** Grava só onde o vetor ainda falta; devolve quantos gravou. */
  gravarVetores(usuarioId: string, vetores: readonly VetorDoTrecho[]): Promise<number>;
}

export interface ProgressoReindexacao {
  readonly usuarioId: string;
  readonly feitos: number;
  readonly total: number;
}

export interface OpcoesReindexacao {
  readonly repositorio: RepositorioReindexacao;
  readonly embeddings: Embeddings;
  /** Trechos por chamada ao provedor (e por transação no banco). Padrão: 64. */
  readonly tamanhoLote?: number;
  /** Só estas pessoas; por padrão, todas as que têm trecho sem vetor. */
  readonly usuarioIds?: readonly string[];
  readonly aoProgresso?: (p: ProgressoReindexacao) => void;
}

export interface ResultadoReindexacao {
  readonly pessoas: number;
  readonly trechos: number;
}

export const TAMANHO_LOTE_REINDEXACAO = 64;

async function reindexarPessoa(o: OpcoesReindexacao, usuarioId: string, lote: number): Promise<number> {
  const total = await o.repositorio.contarTrechosSemVetor(usuarioId);
  let feitos = 0;
  for (;;) {
    const pendentes = await o.repositorio.trechosSemVetor(usuarioId, lote);
    if (pendentes.length === 0) return feitos;
    const vetores = await o.embeddings.gerar(
      pendentes.map((t) => textoParaEmbedding(t.titulo, t.texto)),
      "documento",
    );
    const gravados = await o.repositorio.gravarVetores(
      usuarioId,
      pendentes.map((t, i) => ({ id: t.id, embedding: vetores[i] ?? [] })),
    );
    // Lote não gravado voltaria igual na próxima volta: melhor parar do que girar para sempre.
    if (gravados === 0) {
      throw new ErroConhecimento(
        `nenhum vetor foi gravado para ${usuarioId} (lote de ${pendentes.length}); confira as permissões no banco`,
      );
    }
    feitos += gravados;
    o.aoProgresso?.({ usuarioId, feitos, total: Math.max(total, feitos) });
  }
}

/**
 * Backfill dos embeddings: para cada pessoa, calcula os vetores dos trechos gravados
 * sem eles, em lotes. Cada lote é gravado na hora, então rodar de novo depois de uma
 * falha continua de onde parou; sem nada pendente, não gasta nenhuma chamada.
 */
export async function reindexar(o: OpcoesReindexacao): Promise<ResultadoReindexacao> {
  const lote = o.tamanhoLote ?? TAMANHO_LOTE_REINDEXACAO;
  if (!Number.isInteger(lote) || lote < 1) {
    throw new ErroConhecimento(`tamanho de lote inválido (${lote}): use um inteiro positivo`);
  }
  const pessoas = o.usuarioIds ? [...o.usuarioIds] : await o.repositorio.pessoasComTrechosSemVetor();
  let pessoasComTrabalho = 0;
  let trechos = 0;
  for (const usuarioId of pessoas) {
    const feitos = await reindexarPessoa(o, usuarioId, lote);
    if (feitos > 0) pessoasComTrabalho++;
    trechos += feitos;
  }
  return { pessoas: pessoasComTrabalho, trechos };
}
