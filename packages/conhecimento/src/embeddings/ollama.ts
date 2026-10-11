import { z } from "zod";
import { postarJson } from "./http.js";
import {
  DIMENSOES,
  ErroEmbeddings,
  conferirVetores,
  emLotes,
  type BuscarHttp,
  type Embeddings,
  type Esperar,
} from "./tipos.js";

export interface OpcoesOllama {
  readonly url?: string;
  readonly modelo?: string;
  readonly tamanhoLote?: number;
  readonly fetch?: BuscarHttp;
  readonly esperar?: Esperar;
}

const RespostaOllama = z.object({ embeddings: z.array(z.array(z.number())) });

/**
 * Embeddings locais pelo Ollama (POST /api/embed). O bge-m3 não distingue documento
 * de consulta, então o tipo é ignorado.
 */
export function criarEmbeddingsOllama(o: OpcoesOllama = {}): Embeddings {
  const url = `${(o.url ?? "http://localhost:11434").replace(/\/+$/, "")}/api/embed`;
  const modelo = o.modelo ?? "bge-m3";

  async function lote(textos: readonly string[]): Promise<number[][]> {
    const bruto = await postarJson({
      url,
      corpo: { model: modelo, input: textos },
      ...(o.fetch ? { fetch: o.fetch } : {}),
      ...(o.esperar ? { esperar: o.esperar } : {}),
    });
    const lido = RespostaOllama.safeParse(bruto);
    if (!lido.success) {
      throw new ErroEmbeddings(
        `Resposta inesperada do Ollama (${lido.error.message}). Rode \`ollama pull ${modelo}\` e confira OLLAMA_URL.`,
      );
    }
    return conferirVetores(lido.data.embeddings, textos.length, "Ollama");
  }

  return {
    dimensoes: DIMENSOES,
    async gerar(textos) {
      const resultados = [];
      for (const parte of emLotes(textos, o.tamanhoLote ?? 32)) resultados.push(await lote(parte));
      return resultados.flat();
    },
  };
}
