import {
  ArquivoIngeridoEsquema,
  DocumentoComTrechosEsquema,
  EstadoConhecimentoEsquema,
  FonteDocumento,
  LIMITE_ARQUIVO_BYTES,
  NovoLinkEsquema,
  ResultadoBuscaConhecimentoEsquema,
} from "@zentrade/contratos";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { usuarioIdDe } from "../autenticacao/plugin.js";
import type { Dependencias } from "../dependencias.js";
import { ErroApi, naoEncontrado } from "../erros.js";
import type { ServicoArquivos } from "../integracoes/conhecimento-arquivos.js";
import { exigirUuid, ouNaoEncontrado, ParamId } from "./comum.js";

const ConsultaArquivo = z.object({
  nome: z.string().min(1).max(255),
  fonte: FonteDocumento.default("nota"),
  titulo: z.string().trim().min(1).max(200).optional(),
});
const ConsultaBusca = z.object({
  q: z.string().trim().min(1).max(500),
  limite: z.coerce.number().int().min(1).max(20).default(8),
});
/** Baixar link e extrair arquivo custam (rede, CPU, embeddings): teto por minuto. */
const LIMITE_INGESTAO = { max: 20, timeWindow: "1 minute" } as const;

function servico(deps: Dependencias): ServicoArquivos {
  if (!deps.arquivos) {
    throw new ErroApi(
      503,
      "conhecimento_indisponivel",
      "o envio de arquivos e links não está configurado nesta API",
    );
  }
  return deps.arquivos;
}

/** O arquivo chega cru; outro Content-Type (JSON, multipart) não é aceito. */
function bytesDoCorpo(corpo: unknown): Buffer {
  if (Buffer.isBuffer(corpo)) return corpo;
  throw new ErroApi(415, "tipo_de_corpo", "envie o arquivo cru, com Content-Type: application/octet-stream");
}

type App = Parameters<FastifyPluginAsyncZod<{ deps: Dependencias }>>[0];

function registrarIngestao(app: App, deps: Dependencias): void {
  // Só neste plugin: o arquivo chega cru (bytes), não em JSON nem multipart.
  app.addContentTypeParser(
    "application/octet-stream",
    { parseAs: "buffer", bodyLimit: LIMITE_ARQUIVO_BYTES },
    (_req, corpo, feito) => feito(null, corpo),
  );

  // 201 quando o conteúdo é novo; 200 quando já existia (mesmo texto): nada é duplicado.
  app.post(
    "/conhecimento/arquivos",
    {
      bodyLimit: LIMITE_ARQUIVO_BYTES,
      config: { acesso: "operar", rateLimit: LIMITE_INGESTAO },
      schema: {
        querystring: ConsultaArquivo,
        response: { 200: ArquivoIngeridoEsquema, 201: ArquivoIngeridoEsquema },
      },
    },
    async (req, reply) => {
      const r = await servico(deps).ingerirArquivo(usuarioIdDe(req), {
        nome: req.query.nome,
        bytes: bytesDoCorpo(req.body),
        fonte: req.query.fonte,
        ...(req.query.titulo ? { titulo: req.query.titulo } : {}),
      });
      return reply.code(r.novo ? 201 : 200).send(r);
    },
  );

  app.post(
    "/conhecimento/links",
    {
      config: { acesso: "operar", rateLimit: LIMITE_INGESTAO },
      schema: {
        body: NovoLinkEsquema,
        response: { 200: ArquivoIngeridoEsquema, 201: ArquivoIngeridoEsquema },
      },
    },
    async (req, reply) => {
      const r = await servico(deps).ingerirLink(usuarioIdDe(req), {
        url: req.body.url,
        fonte: req.body.fonte,
        ...(req.body.titulo ? { titulo: req.body.titulo } : {}),
      });
      return reply.code(r.novo ? 201 : 200).send(r);
    },
  );
}

function registrarConsultas(app: App, deps: Dependencias): void {
  // Para a tela avisar "busca só por palavras" antes mesmo de alguém buscar.
  app.get(
    "/conhecimento/estado",
    { config: { acesso: "leitura" }, schema: { response: { 200: EstadoConhecimentoEsquema } } },
    async (req) => servico(deps).estado(usuarioIdDe(req)),
  );

  app.get(
    "/conhecimento/busca",
    {
      config: { acesso: "leitura" },
      schema: { querystring: ConsultaBusca, response: { 200: z.array(ResultadoBuscaConhecimentoEsquema) } },
    },
    async (req) => servico(deps).buscar(usuarioIdDe(req), req.query.q, req.query.limite),
  );

  app.get(
    "/conhecimento/documentos/:id",
    {
      config: { acesso: "leitura" },
      schema: { params: ParamId, response: { 200: DocumentoComTrechosEsquema } },
    },
    async (req) =>
      ouNaoEncontrado(
        await deps.banco.conhecimentoDetalhe.detalhe(
          usuarioIdDe(req),
          exigirUuid(req.params.id, "documento"),
        ),
        "documento",
      ),
  );

  app.delete(
    "/conhecimento/documentos/:id",
    { config: { acesso: "operar" }, schema: { params: ParamId } },
    async (req, reply) => {
      const apagado = await deps.banco.conhecimentoDetalhe.apagar(
        usuarioIdDe(req),
        exigirUuid(req.params.id, "documento"),
      );
      if (!apagado) throw naoEncontrado("documento");
      return reply.code(204).send();
    },
  );
}

/**
 * Base de conhecimento por arquivo e link, os trechos de cada documento, apagar e
 * buscar. Tudo da pessoa autenticada (RLS no banco e usuario_id em toda busca).
 */
export const rotasConhecimentoArquivos: FastifyPluginAsyncZod<{ deps: Dependencias }> = async (
  app,
  { deps },
) => {
  registrarIngestao(app, deps);
  registrarConsultas(app, deps);
};
