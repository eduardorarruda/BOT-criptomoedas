import type { Banco, OrigemParaGravar } from "@zentrade/banco";
import {
  criarBuscaHibrida,
  detectarTipo,
  ErroConhecimento,
  ErroEmbeddings,
  ErroExtracao,
  lerLink,
  type LinkLido,
  type RepositorioConhecimento,
  type TextoExtraido,
} from "@zentrade/conhecimento";
import type {
  ArquivoIngerido,
  EstadoConhecimento,
  FonteDocumento,
  ResultadoBuscaConhecimento,
} from "@zentrade/contratos";
import { ErroApi } from "../erros.js";
import { estadoDaBusca, type FonteEmbeddings, type ServicoConhecimento } from "./conhecimento.js";
import { extrairIsolado } from "./extracao-isolada.js";

/** Arquivos e links para a base de conhecimento da pessoa, e a busca nela. */
export interface ServicoArquivos {
  ingerirArquivo(usuarioId: string, a: ArquivoEnviado): Promise<ArquivoIngerido>;
  ingerirLink(usuarioId: string, l: LinkPedido): Promise<ArquivoIngerido>;
  buscar(usuarioId: string, consulta: string, limite: number): Promise<ResultadoBuscaConhecimento[]>;
  /** Modo da busca e quantos trechos da pessoa esperam vetor (para a tela avisar). */
  estado(usuarioId: string): Promise<EstadoConhecimento>;
}

export interface ArquivoEnviado {
  readonly nome: string;
  readonly bytes: Buffer;
  readonly fonte: FonteDocumento;
  readonly titulo?: string;
}

export interface LinkPedido {
  readonly url: string;
  readonly fonte: FonteDocumento;
  readonly titulo?: string;
}

export interface DependenciasArquivos {
  readonly conhecimento: ServicoConhecimento;
  readonly banco: Pick<Banco, "conhecimentoDetalhe"> & {
    readonly conhecimento: Pick<Banco["conhecimento"], "contarTrechosSemVetor">;
  };
  readonly repositorio: RepositorioConhecimento;
  readonly embeddings: FonteEmbeddings;
  readonly agora: () => number;
  /** Para os testes: o padrão baixa com a defesa contra SSRF de @zentrade/conhecimento. */
  readonly lerLink?: (url: string) => Promise<LinkLido>;
}

const LIMITE_NOME = 255;
const LIMITE_TITULO = 200;

/** Só o nome (nada de caminho), sem caracteres de controle e com tamanho máximo. */
export function nomeSeguro(bruto: string): string {
  const nome = (bruto.split(/[\\/]/).at(-1) ?? "")
    .split("")
    .filter((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127)
    .join("")
    .trim();
  return (nome || "arquivo").slice(0, LIMITE_NOME);
}

const semExtensao = (nome: string): string => nome.replace(/\.[^.]+$/, "") || nome;

function traduzir(erro: unknown, codigo: string): unknown {
  if (erro instanceof ErroExtracao) return new ErroApi(422, codigo, erro.message);
  return erro;
}

async function gravar(
  d: DependenciasArquivos,
  usuarioId: string,
  texto: TextoExtraido,
  doc: { titulo: string; fonte: FonteDocumento; url?: string },
  origem: OrigemParaGravar,
): Promise<ArquivoIngerido> {
  const r = await d.conhecimento.ingerir(usuarioId, { ...doc, publicadoEm: d.agora(), texto: texto.texto });
  if (r.novo) await d.banco.conhecimentoDetalhe.gravarOrigem(usuarioId, r.id, origem);
  return { ...r, caracteres: texto.caracteres, truncado: texto.truncado };
}

async function ingerirArquivo(d: DependenciasArquivos, usuarioId: string, a: ArquivoEnviado) {
  const nome = nomeSeguro(a.nome);
  const extraido = await (async () => {
    const tipo = detectarTipo(nome, a.bytes);
    // Numa worker thread com teto de memória e tempo: arquivo hostil não derruba a API.
    return { tipo, texto: await extrairIsolado(a.bytes, tipo) };
  })().catch((e: unknown) => {
    throw traduzir(e, "arquivo_invalido");
  });
  const titulo = (a.titulo ?? extraido.texto.titulo ?? semExtensao(nome)).slice(0, LIMITE_TITULO);
  return gravar(
    d,
    usuarioId,
    extraido.texto,
    { titulo, fonte: a.fonte },
    {
      origem: "arquivo",
      nomeArquivo: nome,
      tipoArquivo: extraido.tipo,
      bytes: a.bytes.length,
    },
  );
}

async function ingerirLink(d: DependenciasArquivos, usuarioId: string, l: LinkPedido) {
  const ler = d.lerLink ?? ((url: string) => lerLink(url, {}, (bytes, tipo) => extrairIsolado(bytes, tipo)));
  const lido = await ler(l.url).catch((e: unknown) => {
    throw traduzir(e, "link_invalido");
  });
  const titulo = (l.titulo ?? lido.titulo ?? new URL(lido.url).hostname).slice(0, LIMITE_TITULO);
  return gravar(
    d,
    usuarioId,
    lido,
    { titulo, fonte: l.fonte, url: lido.url },
    {
      origem: "link",
      tipoArquivo: lido.tipo,
      bytes: lido.bytes,
    },
  );
}

async function buscar(d: DependenciasArquivos, usuarioId: string, consulta: string, limite: number) {
  if ("indisponivel" in d.embeddings) {
    throw new ErroApi(503, "conhecimento_indisponivel", `o RAG está desligado: ${d.embeddings.indisponivel}`);
  }
  // embeddings null (EMBEDDINGS_PROVEDOR=nenhum): a busca roda só por palavras e diz isso.
  const busca = criarBuscaHibrida({ repositorio: d.repositorio, embeddings: d.embeddings.embeddings });
  const achados = await busca.buscar(consulta, { usuarioId, limite }).catch((e: unknown) => {
    if (e instanceof ErroConhecimento) throw new ErroApi(400, "busca_invalida", e.message);
    if (e instanceof ErroEmbeddings) throw new ErroApi(502, "embeddings_falhou", e.message);
    throw e;
  });
  return achados.map((a) => ({
    trechoId: a.trechoId,
    documentoId: a.documentoId,
    fonte: a.fonte,
    titulo: a.titulo,
    url: a.url,
    publicadoEm: a.publicadoEm.getTime(),
    texto: a.texto,
    pontuacao: a.pontuacao,
    modo: busca.modo,
  }));
}

async function estado(d: DependenciasArquivos, usuarioId: string): Promise<EstadoConhecimento> {
  return {
    busca: estadoDaBusca(d.embeddings),
    trechosSemVetor: await d.banco.conhecimento.contarTrechosSemVetor(usuarioId),
    motivo: "indisponivel" in d.embeddings ? d.embeddings.indisponivel : null,
  };
}

/**
 * Extrai o texto (PDF, DOCX, MD, TXT, HTML) e entra no RAG da pessoa pela mesma ingestão
 * das notas (mesmo divisor, mesmo hash, sob RLS); grava de onde o documento veio.
 */
export function criarServicoArquivos(d: DependenciasArquivos): ServicoArquivos {
  return {
    ingerirArquivo: (usuarioId, a) => ingerirArquivo(d, usuarioId, a),
    ingerirLink: (usuarioId, l) => ingerirLink(d, usuarioId, l),
    buscar: (usuarioId, consulta, limite) => buscar(d, usuarioId, consulta, limite),
    estado: (usuarioId) => estado(d, usuarioId),
  };
}
