import type { Fonte } from "@zentrade/banco";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { usuarioIdDe } from "../autenticacao/plugin.js";
import type { Dependencias } from "../dependencias.js";
import { ErroApi } from "../erros.js";
import { fatiarTexto } from "../integracoes/embeddings.js";

export const LIMITE_TEXTO = 100_000;

export interface Ingestao {
  readonly fonte: Fonte;
  readonly titulo: string;
  readonly url?: string;
  readonly publicadoEm: number;
  readonly texto: string;
}

/** Fatia o texto, gera os embeddings e grava documento + trechos numa transação. */
export async function ingerir(deps: Dependencias, usuarioId: string, doc: Ingestao) {
  if (!deps.embeddings) {
    throw new ErroApi(
      503,
      "conhecimento_indisponivel",
      "o RAG precisa de um serviço de embeddings; configure EMBEDDINGS_URL (Ollama com bge-m3 ou Voyage)",
    );
  }
  const textos = fatiarTexto(doc.texto);
  if (textos.length === 0) throw new ErroApi(400, "texto_vazio", "o texto está vazio");
  const vetores = await deps.embeddings.gerar(textos);
  return deps.banco.conhecimento.ingerir(usuarioId, {
    ...doc,
    trechos: textos.map((texto, i) => ({ texto, embedding: vetores[i] ?? [] })),
  });
}

export const rotasConhecimento: FastifyPluginAsyncZod<{ deps: Dependencias }> = async (app, { deps }) => {
  app.get("/conhecimento/documentos", { config: { acesso: "leitura" } }, async (req) =>
    deps.banco.conhecimento.listar(usuarioIdDe(req)),
  );

  app.post(
    "/conhecimento/notas",
    {
      config: { acesso: "operar" },
      schema: {
        body: z.object({ titulo: z.string().min(1).max(200), texto: z.string().min(1).max(LIMITE_TEXTO) }),
      },
    },
    async (req, reply) => {
      const r = await ingerir(deps, usuarioIdDe(req), {
        ...req.body,
        fonte: "nota",
        publicadoEm: deps.agora(),
      });
      return reply.code(r.novo ? 201 : 200).send(r);
    },
  );
};
