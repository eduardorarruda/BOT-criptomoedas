import {
  ArquivoIngeridoEsquema,
  DocumentoComTrechosEsquema,
  DocumentoDetalheEsquema,
  EstadoConhecimentoEsquema,
  ResultadoBuscaConhecimentoEsquema,
  type ArquivoIngerido,
  type DocumentoComTrechos,
  type DocumentoDetalhe,
  type EstadoConhecimento,
  type FonteDocumento,
  type ResultadoBuscaConhecimento,
} from "@zentrade/contratos/esquemas";
import { z } from "zod";
import { CABECALHO_CSRF, criarCliente, lerCookieCsrf, type ClienteApi } from "../../api/cliente";
import { ERRO_RESPOSTA_INVALIDA, ERRO_SEM_CONEXAO, erroPorStatus, ErroApi } from "../../api/erros";
import { ErroRespostaEsquema } from "../../api/esquemas";

/** Tipos aceitos (conferidos de novo pelo conteúdo na API) e o teto do envio. */
export const EXTENSOES_ACEITAS = [".pdf", ".docx", ".md", ".markdown", ".txt", ".html", ".htm"] as const;
export const LIMITE_ENVIO_BYTES = 15 * 1024 * 1024;

interface NovoLinkTela {
  readonly url: string;
  readonly titulo?: string;
  readonly fonte: FonteDocumento;
}

export interface ApiConhecimento {
  /** Modo da busca (híbrida ou só por palavras, sem embeddings) e trechos sem vetor. */
  estado(): Promise<EstadoConhecimento>;
  documentos(): Promise<DocumentoDetalhe[]>;
  detalhe(id: string): Promise<DocumentoComTrechos>;
  apagar(id: string): Promise<void>;
  buscar(consulta: string): Promise<ResultadoBuscaConhecimento[]>;
  enviarLink(l: NovoLinkTela): Promise<ArquivoIngerido>;
  /** Envia o arquivo cru; `aoProgresso` recebe de 0 a 1 enquanto os bytes sobem. */
  enviarArquivo(
    arquivo: File,
    fonte: FonteDocumento,
    aoProgresso: (fracao: number) => void,
  ): Promise<ArquivoIngerido>;
}

/** O que dá para conferir antes de enviar; a API confere de novo (e pelo conteúdo). */
export function conferirArquivo(arquivo: Pick<File, "name" | "size">): string | null {
  const nome = arquivo.name.toLowerCase();
  if (!EXTENSOES_ACEITAS.some((e) => nome.endsWith(e)))
    return "Tipo não aceito. Envie PDF, DOCX, MD, TXT ou HTML.";
  if (arquivo.size === 0) return "O arquivo está vazio.";
  if (arquivo.size > LIMITE_ENVIO_BYTES) return "O arquivo passa de 15 MB.";
  return null;
}

function respostaDoEnvio(xhr: XMLHttpRequest): ArquivoIngerido {
  const corpo: unknown = JSON.parse(xhr.responseText || "null");
  if (xhr.status >= 200 && xhr.status < 300) {
    const lido = ArquivoIngeridoEsquema.safeParse(corpo);
    if (!lido.success) throw ERRO_RESPOSTA_INVALIDA("/conhecimento/arquivos");
    return lido.data;
  }
  const erro = ErroRespostaEsquema.safeParse(corpo);
  throw erro.success
    ? new ErroApi(erro.data.erro.codigo, erro.data.erro.mensagem, xhr.status)
    : erroPorStatus(xhr.status);
}

/** XMLHttpRequest porque o fetch não informa o progresso do envio. */
export function enviarComProgresso(
  url: string,
  corpo: Blob,
  csrf: string | null,
  aoProgresso: (fracao: number) => void,
  criarXhr: () => XMLHttpRequest = () => new XMLHttpRequest(),
): Promise<ArquivoIngerido> {
  return new Promise((ok, falhar) => {
    const xhr = criarXhr();
    xhr.open("POST", url);
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    if (csrf) xhr.setRequestHeader(CABECALHO_CSRF, csrf);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) aoProgresso(e.loaded / e.total);
    };
    xhr.onload = () => {
      try {
        ok(respostaDoEnvio(xhr));
      } catch (e) {
        falhar(e instanceof ErroApi ? e : erroPorStatus(xhr.status));
      }
    };
    xhr.onerror = () => falhar(ERRO_SEM_CONEXAO());
    xhr.send(corpo);
  });
}

export function criarApiConhecimento(
  cliente: ClienteApi = criarCliente(),
  criarXhr?: () => XMLHttpRequest,
  lerCsrf: () => string | null = () => lerCookieCsrf(),
): ApiConhecimento {
  const { pedir } = cliente;
  return {
    estado: () => pedir("GET", "/conhecimento/estado", EstadoConhecimentoEsquema),
    documentos: () => pedir("GET", "/conhecimento/documentos", z.array(DocumentoDetalheEsquema)),
    detalhe: (id) =>
      pedir("GET", `/conhecimento/documentos/${encodeURIComponent(id)}`, DocumentoComTrechosEsquema),
    apagar: async (id) => {
      await pedir("DELETE", `/conhecimento/documentos/${encodeURIComponent(id)}`, null);
    },
    buscar: (q) =>
      pedir("GET", "/conhecimento/busca", z.array(ResultadoBuscaConhecimentoEsquema), undefined, {
        q,
        limite: 8,
      }),
    enviarLink: (l) => pedir("POST", "/conhecimento/links", ArquivoIngeridoEsquema, l),
    enviarArquivo: (arquivo, fonte, aoProgresso) => {
      const consulta = new URLSearchParams({ nome: arquivo.name, fonte });
      return enviarComProgresso(
        `/api/v1/conhecimento/arquivos?${consulta}`,
        arquivo,
        lerCsrf(),
        aoProgresso,
        criarXhr,
      );
    },
  };
}
