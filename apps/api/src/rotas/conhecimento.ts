import {
  DocumentoDetalheEsquema,
  DocumentoIngeridoEsquema,
  LIMITE_TEXTO_CONHECIMENTO,
} from "@zentrade/contratos";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { usuarioIdDe } from "../autenticacao/plugin.js";
import type { Dependencias } from "../dependencias.js";

const NovaNota = z.object({
  titulo: z.string().min(1).max(200),
  texto: z.string().min(1).max(LIMITE_TEXTO_CONHECIMENTO),
});

export const rotasConhecimento: FastifyPluginAsyncZod<{ deps: Dependencias }> = async (app, { deps }) => {
  // Mais recentes primeiro, com a origem (texto, arquivo, link, automação) e os trechos de cada um.
  app.get(
    "/conhecimento/documentos",
    { config: { acesso: "leitura" }, schema: { response: { 200: z.array(DocumentoDetalheEsquema) } } },
    async (req) => deps.banco.conhecimentoDetalhe.listar(usuarioIdDe(req)),
  );

  // 201 quando o conteúdo é novo; 200 quando já existia (mesmo hash): nada é duplicado.
  app.post(
    "/conhecimento/notas",
    {
      config: { acesso: "operar" },
      schema: { body: NovaNota, response: { 200: DocumentoIngeridoEsquema, 201: DocumentoIngeridoEsquema } },
    },
    async (req, reply) => {
      const usuarioId = usuarioIdDe(req);
      const r = await deps.conhecimento.ingerir(usuarioId, {
        ...req.body,
        fonte: "nota",
        publicadoEm: deps.agora(),
      });
      if (r.novo) await deps.banco.conhecimentoDetalhe.gravarOrigem(usuarioId, r.id, { origem: "texto" });
      return reply.code(r.novo ? 201 : 200).send(r);
    },
  );
};
