import type { Banco } from "@zentrade/banco";
import type {
  Documento,
  DocumentoIngerido,
  EstadoBuscaConhecimento,
  FonteDocumento,
} from "@zentrade/contratos";
import {
  criarRepositorioPostgres,
  embeddingsDoAmbiente,
  ErroConhecimento,
  ErroEmbeddings,
  ingerir,
  type Embeddings,
  type RepositorioConhecimento,
} from "@zentrade/conhecimento";
import { ErroApi } from "../erros.js";

/** O que chega pela tela (nota) ou pelo n8n (notícia, regra da corretora...). */
export interface DocumentoNovo {
  readonly fonte: FonteDocumento;
  readonly titulo: string;
  readonly url?: string;
  readonly publicadoEm: number;
  readonly texto: string;
}

export interface ServicoConhecimento {
  /** Como a busca roda nesta API: híbrida, só por palavras (EMBEDDINGS_PROVEDOR=nenhum) ou desligada. */
  readonly busca: EstadoBuscaConhecimento;
  ingerir(usuarioId: string, doc: DocumentoNovo): Promise<DocumentoIngerido>;
}

/**
 * Embeddings prontos (`null` com EMBEDDINGS_PROVEDOR=nenhum: só busca por palavras),
 * ou o motivo de o RAG estar desligado (ex.: falta VOYAGE_API_KEY).
 */
export type FonteEmbeddings = { readonly embeddings: Embeddings | null } | { readonly indisponivel: string };

type Ambiente = Readonly<Record<string, string | undefined>>;

export function estadoDaBusca(f: FonteEmbeddings): EstadoBuscaConhecimento {
  if ("indisponivel" in f) return "desligada";
  return f.embeddings ? "hibrida" : "palavras";
}

/**
 * Lê EMBEDDINGS_PROVEDOR, VOYAGE_* e OLLAMA_* pela mesma função do agente: uma
 * configuração só no projeto inteiro. Sem chave, a API sobe com o RAG desligado.
 */
export function prepararEmbeddings(env: Ambiente, criar = embeddingsDoAmbiente): FonteEmbeddings {
  try {
    return { embeddings: criar(env) };
  } catch (erro) {
    if (erro instanceof ErroEmbeddings) return { indisponivel: erro.message };
    throw erro;
  }
}

function traduzir(erro: unknown): unknown {
  if (erro instanceof ErroConhecimento) return new ErroApi(400, "documento_invalido", erro.message);
  if (erro instanceof ErroEmbeddings) {
    return new ErroApi(
      502,
      "embeddings_falhou",
      `o serviço de embeddings falhou; nada foi gravado. Detalhe: ${erro.message}`,
    );
  }
  return erro;
}

/**
 * Ingestão do RAG pela API com @zentrade/conhecimento: o mesmo normalizador, divisor
 * e hash que o agente usa, gravando pelo repositório do banco (sob RLS).
 */
export function criarServicoConhecimento(o: {
  readonly repositorio: RepositorioConhecimento;
  readonly documentos: { obter(usuarioId: string, id: string): Promise<Documento | null> };
  readonly embeddings: FonteEmbeddings;
}): ServicoConhecimento {
  return {
    busca: estadoDaBusca(o.embeddings),
    async ingerir(usuarioId, doc) {
      if ("indisponivel" in o.embeddings) {
        throw new ErroApi(
          503,
          "conhecimento_indisponivel",
          `o RAG está desligado: ${o.embeddings.indisponivel}`,
        );
      }
      const deps = { repositorio: o.repositorio, embeddings: o.embeddings.embeddings };
      const r = await ingerir({ ...doc, usuarioId }, deps).catch((erro: unknown) => {
        throw traduzir(erro);
      });
      const documento = await o.documentos.obter(usuarioId, r.documentoId);
      if (!documento) throw new Error(`documento ${r.documentoId} sumiu logo depois de gravado`);
      return { ...documento, novo: r.novo, trechos: r.trechos };
    },
  };
}

/**
 * A porta do RAG sobre o banco da API: gravação pelo repositório com RLS; a busca
 * (que a API não usa hoje) é a do próprio pacote, filtrada por usuario_id.
 */
export function repositorioRag(banco: Pick<Banco, "conexao" | "conhecimento">): RepositorioConhecimento {
  return {
    ...criarRepositorioPostgres(banco.conexao.sql),
    documentoPorHash: (usuarioId, hash) => banco.conhecimento.documentoPorHash(usuarioId, hash),
    gravarDocumento: (doc, trechos) => banco.conhecimento.gravarDocumento(doc, trechos),
  };
}
