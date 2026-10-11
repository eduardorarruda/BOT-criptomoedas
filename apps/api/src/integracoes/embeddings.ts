import { z } from "zod";
import type { Buscar } from "./tipos.js";

export const DIMENSOES = 1024;

export interface Embeddings {
  gerar(textos: readonly string[]): Promise<number[][]>;
}

export interface ConfigEmbeddings {
  readonly url: string;
  readonly modelo: string;
  readonly chave?: string;
}

const RespostaEsquema = z.object({
  data: z.array(z.object({ index: z.number().int(), embedding: z.array(z.number()) })),
});

/**
 * Cliente de embeddings no formato OpenAI (`{ model, input }` → `{ data: [{ embedding }] }`),
 * que Voyage e Ollama (bge-m3) também aceitam. Os dois produzem 1024 dimensões.
 */
export function criarEmbeddings(c: ConfigEmbeddings, buscar: Buscar = fetch): Embeddings {
  return {
    async gerar(textos) {
      const resposta = await buscar(c.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(c.chave ? { authorization: `Bearer ${c.chave}` } : {}),
        },
        body: JSON.stringify({ model: c.modelo, input: textos }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!resposta.ok) {
        throw new Error(
          `o serviço de embeddings respondeu ${resposta.status}; confira EMBEDDINGS_URL e EMBEDDINGS_CHAVE`,
        );
      }
      const { data } = RespostaEsquema.parse(await resposta.json());
      const errado = data.find((d) => d.embedding.length !== DIMENSOES);
      if (errado) {
        throw new Error(
          `o modelo devolveu vetores de ${errado.embedding.length} dimensões; o RAG usa ${DIMENSOES} (use bge-m3 ou voyage)`,
        );
      }
      return [...data].sort((a, b) => a.index - b.index).map((d) => d.embedding);
    },
  };
}

function cortar(paragrafo: string, maximo: number): string[] {
  const pedacos: string[] = [];
  for (let i = 0; i < paragrafo.length; i += maximo) pedacos.push(paragrafo.slice(i, i + maximo));
  return pedacos;
}

/** Junta parágrafos até `maximo` caracteres por trecho; parágrafo maior que isso é cortado. */
export function fatiarTexto(texto: string, maximo = 1200): string[] {
  const paragrafos = texto
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .flatMap((p) => cortar(p, maximo));
  const trechos: string[] = [];
  let atual = "";
  for (const p of paragrafos) {
    const junto = atual ? `${atual}\n\n${p}` : p;
    if (junto.length <= maximo) {
      atual = junto;
      continue;
    }
    if (atual) trechos.push(atual);
    atual = p;
  }
  if (atual) trechos.push(atual);
  return trechos;
}
