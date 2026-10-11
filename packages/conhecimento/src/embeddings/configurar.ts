import { z } from "zod";
import { criarEmbeddingsOllama } from "./ollama.js";
import { ErroEmbeddings, type Embeddings } from "./tipos.js";
import { criarEmbeddingsVoyage, MODELO_VOYAGE_PADRAO } from "./voyage.js";

const AmbienteEmbeddings = z.object({
  EMBEDDINGS_PROVEDOR: z.enum(["voyage", "ollama"]).default("voyage"),
  VOYAGE_API_KEY: z.string().optional(),
  VOYAGE_MODELO: z.string().min(1).default(MODELO_VOYAGE_PADRAO),
  OLLAMA_URL: z.url().default("http://localhost:11434"),
  OLLAMA_MODELO: z.string().min(1).default("bge-m3"),
});

/** Escolhe o provedor de embeddings pelas variáveis de ambiente (validadas). */
export function embeddingsDoAmbiente(env: Readonly<Record<string, string | undefined>>): Embeddings {
  const lido = AmbienteEmbeddings.safeParse(env);
  if (!lido.success) {
    throw new ErroEmbeddings(
      `Configuração de embeddings inválida: ${z.prettifyError(lido.error)}. ` +
        "EMBEDDINGS_PROVEDOR aceita voyage ou ollama.",
    );
  }
  const a = lido.data;
  return a.EMBEDDINGS_PROVEDOR === "ollama"
    ? criarEmbeddingsOllama({ url: a.OLLAMA_URL, modelo: a.OLLAMA_MODELO })
    : criarEmbeddingsVoyage({ chave: a.VOYAGE_API_KEY, modelo: a.VOYAGE_MODELO });
}
