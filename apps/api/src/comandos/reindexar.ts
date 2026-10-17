import type { Banco } from "@zentrade/banco";
import {
  reindexar,
  TAMANHO_LOTE_REINDEXACAO,
  type Embeddings,
  type ResultadoReindexacao,
} from "@zentrade/conhecimento";
import { z } from "zod";
import type { FonteEmbeddings } from "../integracoes/conhecimento.js";
import { lerArgumentos } from "./usuario.js";

const LOTE_MAXIMO = 512;

const Argumentos = z.object({
  email: z.email("informe um e-mail válido em --email").optional(),
  lote: z.coerce
    .number()
    .int("--lote precisa ser um número inteiro")
    .min(1, "--lote precisa ser pelo menos 1")
    .max(LOTE_MAXIMO, `--lote vai até ${LOTE_MAXIMO}`)
    .default(TAMANHO_LOTE_REINDEXACAO),
});

export interface DependenciasReindexacao {
  readonly banco: Pick<Banco, "usuarios" | "conhecimento">;
  readonly embeddings: FonteEmbeddings;
  readonly escrever: (linha: string) => void;
}

/** Reindexar só faz sentido com um provedor de verdade; sem ele, diz o que configurar. */
export function embeddingsParaReindexar(f: FonteEmbeddings): Embeddings {
  if ("indisponivel" in f) throw new Error(f.indisponivel);
  if (!f.embeddings) {
    throw new Error(
      "EMBEDDINGS_PROVEDOR=nenhum não calcula embeddings. Configure EMBEDDINGS_PROVEDOR=voyage " +
        "(com VOYAGE_API_KEY) ou ollama e rode de novo.",
    );
  }
  return f.embeddings;
}

async function pessoasPedidas(d: DependenciasReindexacao, email: string | undefined) {
  if (!email) return undefined;
  const pessoa = await d.banco.usuarios.porEmail(email);
  if (!pessoa) throw new Error(`nenhuma pessoa com o e-mail ${email}`);
  return [pessoa.id];
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/**
 * reindexar-conhecimento: calcula os embeddings dos trechos gravados sem eles (com
 * EMBEDDINGS_PROVEDOR=nenhum), por pessoa e em lotes. Cada lote fica gravado na hora:
 * se cair no meio, rodar de novo continua de onde parou.
 */
export async function executarReindexacao(
  argv: readonly string[],
  d: DependenciasReindexacao,
): Promise<ResultadoReindexacao> {
  const lido = Argumentos.safeParse(lerArgumentos(argv));
  if (!lido.success) throw new Error(lido.error.issues.map((i) => i.message).join("; "));
  const embeddings = embeddingsParaReindexar(d.embeddings);
  const usuarioIds = await pessoasPedidas(d, lido.data.email);
  const r = await reindexar({
    repositorio: d.banco.conhecimento,
    embeddings,
    tamanhoLote: lido.data.lote,
    ...(usuarioIds ? { usuarioIds } : {}),
    aoProgresso: (p) => d.escrever(`${p.usuarioId}: ${p.feitos}/${p.total} trechos`),
  });
  d.escrever(
    r.trechos === 0
      ? "nada a fazer: todos os trechos já têm embeddings."
      : `pronto: ${plural(r.trechos, "trecho", "trechos")} de ${plural(r.pessoas, "pessoa", "pessoas")} ` +
          "ganharam embeddings.",
  );
  return r;
}
