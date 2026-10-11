import { CABECALHO_ASSINATURA, Instante, RespostaAprovacaoEsquema, verificar } from "@zentrade/contratos";
import type { FastifyInstance } from "fastify";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import type { Dependencias } from "../dependencias.js";
import { ErroApi } from "../erros.js";
import { exigirUuid } from "./comum.js";
import { ingerir, LIMITE_TEXTO } from "./conhecimento.js";

declare module "fastify" {
  interface FastifyRequest {
    corpoBruto?: string;
  }
}

const Conhecimento = z.object({
  fonte: z.enum(["diario", "noticia", "regra_corretora", "estrategia", "nota"]),
  titulo: z.string().min(1).max(200),
  url: z.url().max(2000).optional(),
  publicadoEm: Instante,
  texto: z.string().min(1).max(LIMITE_TEXTO),
});

const LIMITE_CORPO = 256 * 1024;

/** Guarda o corpo cru (a assinatura é sobre ele) e recusa o que não estiver assinado. */
function exigirAssinatura(app: FastifyInstance, deps: Dependencias): void {
  app.decorateRequest("corpoBruto", undefined);
  app.removeContentTypeParser("application/json");
  app.addContentTypeParser(
    "application/json",
    { parseAs: "string", bodyLimit: LIMITE_CORPO },
    (req, corpo, feito) => {
      const texto = String(corpo);
      req.corpoBruto = texto;
      if (texto === "") return feito(null, {});
      try {
        feito(null, JSON.parse(texto));
      } catch {
        feito(new ErroApi(400, "json_invalido", "o corpo do webhook não é JSON válido"), undefined);
      }
    },
  );

  app.addHook("preValidation", async (req) => {
    const cabecalho = req.headers[CABECALHO_ASSINATURA];
    const valida = verificar(
      req.corpoBruto ?? "",
      typeof cabecalho === "string" ? cabecalho : undefined,
      deps.config.N8N_WEBHOOK_SEGREDO,
      deps.agora(),
    );
    if (!valida) {
      req.log.warn({ caminho: req.url }, "webhook recusado: assinatura ausente, inválida ou vencida");
      throw new ErroApi(
        401,
        "assinatura_invalida",
        "assinatura do webhook ausente, inválida ou vencida (validade de 5 minutos)",
      );
    }
  });
}

/**
 * Webhooks do n8n: sem sessão, mas assinados (HMAC de "carimbo.corpo") e com
 * validade de 5 minutos. A assinatura é conferida sobre o corpo cru, antes de
 * qualquer validação: requisição sem assinatura válida nem chega às rotas.
 */
export const rotasWebhooks: FastifyPluginAsyncZod<{ deps: Dependencias }> = async (app, { deps }) => {
  exigirAssinatura(app, deps);

  app.post(
    "/aprovacao",
    { config: { acesso: "publico" }, schema: { body: RespostaAprovacaoEsquema } },
    async (req) => {
      const { decisaoId, aprovada, porQuem } = req.body;
      return deps.banco.decisoes.decidirComoSistema(
        exigirUuid(decisaoId, "decisão"),
        aprovada,
        `n8n:${porQuem}`,
        deps.agora(),
      );
    },
  );

  app.post(
    "/conhecimento",
    { config: { acesso: "publico" }, schema: { body: Conhecimento } },
    async (req, reply) => {
      const dona = deps.config.N8N_USUARIO_ID ?? (await deps.banco.usuarios.primeiro())?.id;
      if (!dona)
        throw new ErroApi(
          409,
          "sem_usuario",
          "crie a primeira pessoa com `pnpm --filter @zentrade/api criar-usuario`",
        );
      const { url, ...resto } = req.body;
      const r = await ingerir(deps, dona, { ...resto, ...(url ? { url } : {}) });
      return reply.code(r.novo ? 201 : 200).send(r);
    },
  );

  app.post("/saude", { config: { acesso: "publico" } }, async () => ({
    motorVivoHaSegundos: await deps.saude.motorVivoHaSegundos(),
    robosPausados: await deps.banco.robos.contarPausados(),
  }));
};
