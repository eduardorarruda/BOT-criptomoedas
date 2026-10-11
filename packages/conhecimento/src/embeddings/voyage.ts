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
  type TipoEntrada,
} from "./tipos.js";

export interface OpcoesVoyage {
  readonly chave: string | undefined;
  /** Modelo da família voyage-4 (aceita output_dimension 1024). */
  readonly modelo?: string;
  readonly tamanhoLote?: number;
  readonly url?: string;
  readonly fetch?: BuscarHttp;
  readonly esperar?: Esperar;
}

export const MODELO_VOYAGE_PADRAO = "voyage-4";

const RespostaVoyage = z.object({
  data: z.array(z.object({ embedding: z.array(z.number()), index: z.number().int().nonnegative() })),
});

const TIPO_VOYAGE: Record<TipoEntrada, "document" | "query"> = { documento: "document", consulta: "query" };

/** Embeddings pela API da Voyage AI (https://docs.voyageai.com/reference/embeddings-api). */
export function criarEmbeddingsVoyage(o: OpcoesVoyage): Embeddings {
  if (!o.chave) {
    throw new ErroEmbeddings(
      "VOYAGE_API_KEY não está definida. Crie uma chave em https://dashboard.voyageai.com e ponha no .env, " +
        "ou use EMBEDDINGS_PROVEDOR=ollama para gerar embeddings localmente.",
    );
  }
  const cabecalhos = { authorization: `Bearer ${o.chave}` };
  const modelo = o.modelo ?? MODELO_VOYAGE_PADRAO;
  const url = o.url ?? "https://api.voyageai.com/v1/embeddings";

  async function lote(textos: readonly string[], tipo: TipoEntrada): Promise<number[][]> {
    const corpo = {
      input: textos,
      model: modelo,
      input_type: TIPO_VOYAGE[tipo],
      output_dimension: DIMENSOES,
    };
    const bruto = await postarJson({
      url,
      corpo,
      cabecalhos,
      ...(o.fetch ? { fetch: o.fetch } : {}),
      ...(o.esperar ? { esperar: o.esperar } : {}),
    });
    const lido = RespostaVoyage.safeParse(bruto);
    if (!lido.success) throw new ErroEmbeddings(`Resposta inesperada da Voyage: ${lido.error.message}`);
    const ordenados = [...lido.data.data].sort((a, b) => a.index - b.index).map((d) => d.embedding);
    return conferirVetores(ordenados, textos.length, "Voyage");
  }

  return {
    dimensoes: DIMENSOES,
    async gerar(textos, tipo) {
      const resultados = [];
      for (const parte of emLotes(textos, o.tamanhoLote ?? 128)) resultados.push(await lote(parte, tipo));
      return resultados.flat();
    },
  };
}
