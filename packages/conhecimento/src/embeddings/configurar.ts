import { z } from "zod";
import { criarEmbeddingsOllama } from "./ollama.js";
import { ErroEmbeddings, type Embeddings } from "./tipos.js";
import { criarEmbeddingsVoyage, MODELO_VOYAGE_PADRAO } from "./voyage.js";

/**
 * `nenhum` desliga os embeddings: os trechos são gravados sem vetor e a busca usa só
 * as palavras (full-text do PostgreSQL). Quando um provedor de verdade for configurado,
 * `reindexar-conhecimento` calcula os vetores que faltam.
 */
export const PROVEDORES_EMBEDDINGS = ["voyage", "ollama", "nenhum"] as const;
export type ProvedorEmbeddings = (typeof PROVEDORES_EMBEDDINGS)[number];

const MENSAGEM_PROVEDOR = "EMBEDDINGS_PROVEDOR aceita voyage, ollama ou nenhum";

const AmbienteEmbeddings = z.object({
  EMBEDDINGS_PROVEDOR: z.enum(PROVEDORES_EMBEDDINGS, { error: MENSAGEM_PROVEDOR }).default("voyage"),
  VOYAGE_API_KEY: z.string().optional(),
  VOYAGE_MODELO: z.string().min(1).default(MODELO_VOYAGE_PADRAO),
  OLLAMA_URL: z.url().default("http://localhost:11434"),
  OLLAMA_MODELO: z.string().min(1).default("bge-m3"),
});

type Ambiente = Readonly<Record<string, string | undefined>>;

function lerAmbiente(env: Ambiente): z.infer<typeof AmbienteEmbeddings> {
  const lido = AmbienteEmbeddings.safeParse(env);
  if (!lido.success) {
    throw new ErroEmbeddings(
      `Configuração de embeddings inválida: ${z.prettifyError(lido.error)}. ${MENSAGEM_PROVEDOR}.`,
    );
  }
  return lido.data;
}

/** Só o nome do provedor (validado), para quem precisa dizer em que modo a busca está. */
export const provedorEmbeddings = (env: Ambiente): ProvedorEmbeddings => lerAmbiente(env).EMBEDDINGS_PROVEDOR;

/**
 * Escolhe o provedor de embeddings pelas variáveis de ambiente (validadas). `null`
 * quando EMBEDDINGS_PROVEDOR=nenhum: ingestão sem vetor e busca só por palavras.
 */
export function embeddingsDoAmbiente(env: Ambiente): Embeddings | null {
  const a = lerAmbiente(env);
  if (a.EMBEDDINGS_PROVEDOR === "nenhum") return null;
  return a.EMBEDDINGS_PROVEDOR === "ollama"
    ? criarEmbeddingsOllama({ url: a.OLLAMA_URL, modelo: a.OLLAMA_MODELO })
    : criarEmbeddingsVoyage({ chave: a.VOYAGE_API_KEY, modelo: a.VOYAGE_MODELO });
}
