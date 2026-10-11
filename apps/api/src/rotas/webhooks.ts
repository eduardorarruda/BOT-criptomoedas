import {
  CABECALHO_ASSINATURA,
  ConhecimentoWebhookEsquema,
  lerCabecalhoAssinatura,
  RespostaAprovacaoEsquema,
  SaudeN8nEsquema,
  segundosDeValidade,
  verificar,
} from "@zentrade/contratos";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import type { Dependencias } from "../dependencias.js";
import { ErroApi } from "../erros.js";
import type { IdFluxo } from "../integracoes/automacoes.js";
import { exigirUuid } from "./comum.js";

declare module "fastify" {
  interface FastifyRequest {
    corpoBruto?: string;
    /** Fluxo do n8n que assinou a requisição (só existe depois da assinatura conferida). */
    fluxoN8n?: IdFluxo | undefined;
  }
}

const LIMITE_CORPO = 256 * 1024;

/** Qual fluxo de infra/n8n chama cada webhook (para o status das automações). */
const FLUXO_DO_CAMINHO: Readonly<Record<string, IdFluxo>> = {
  "/webhooks/n8n/aprovacao": "zentrade-aprovacao",
  "/webhooks/n8n/conhecimento": "zentrade-noticias",
  "/webhooks/n8n/saude": "zentrade-vigia-saude",
};

function guardarCorpoBruto(app: FastifyInstance): void {
  app.decorateRequest("corpoBruto", undefined);
  app.decorateRequest("fluxoN8n", undefined);
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
}

/** Recusa a segunda vez que a mesma assinatura aparece no mesmo caminho, enquanto ela valer. */
async function recusarRepeticao(req: FastifyRequest, deps: Dependencias, cabecalho: string): Promise<void> {
  const lido = lerCabecalhoAssinatura(cabecalho);
  if (!lido) return;
  let primeira: boolean;
  try {
    const chave = `${req.routeOptions.url ?? req.url}:${lido.v1}`;
    primeira = await deps.antiReplay.primeiraVez(chave, segundosDeValidade(lido.carimbo, deps.agora()));
  } catch (erro) {
    req.log.error({ err: erro }, "anti-replay indisponível: webhook recusado por segurança");
    throw new ErroApi(
      503,
      "anti_replay_indisponivel",
      "não deu para conferir se o webhook é repetido (o Redis está fora do ar); tente de novo",
    );
  }
  if (!primeira) {
    req.log.warn({ caminho: req.url }, "webhook recusado: assinatura já usada (replay)");
    throw new ErroApi(409, "webhook_repetido", "esta requisição assinada já foi recebida; assine de novo");
  }
}

/** Guarda o corpo cru (a assinatura é sobre ele) e recusa o que não estiver assinado ou repetir. */
function exigirAssinatura(app: FastifyInstance, deps: Dependencias): void {
  guardarCorpoBruto(app);
  app.addHook("preValidation", async (req) => {
    const bruto = req.headers[CABECALHO_ASSINATURA];
    const cabecalho = typeof bruto === "string" ? bruto : undefined;
    if (!verificar(req.corpoBruto ?? "", cabecalho, deps.config.N8N_WEBHOOK_SEGREDO, deps.agora())) {
      req.log.warn({ caminho: req.url }, "webhook recusado: assinatura ausente, inválida ou vencida");
      throw new ErroApi(
        401,
        "assinatura_invalida",
        "assinatura do webhook ausente, inválida ou vencida (validade de 5 minutos)",
      );
    }
    await recusarRepeticao(req, deps, cabecalho ?? "");
    req.fluxoN8n = FLUXO_DO_CAMINHO[req.routeOptions.url ?? ""];
  });
  app.addHook("onResponse", async (req, reply) => {
    if (req.fluxoN8n) await deps.automacoes.registrar(req.fluxoN8n, reply.statusCode < 400);
  });
}

/**
 * Dona do conhecimento que chega pelo n8n. Com mais de uma pessoa cadastrada, não
 * dá para adivinhar: N8N_USUARIO_ID é obrigatório (e precisa existir).
 */
async function donaDoConhecimento(deps: Dependencias): Promise<string> {
  const configurada = deps.config.N8N_USUARIO_ID;
  if (configurada) {
    if (await deps.banco.usuarios.porId(configurada)) return configurada;
    throw new ErroApi(
      409,
      "n8n_usuario_inexistente",
      "N8N_USUARIO_ID não é o id de nenhuma pessoa cadastrada",
    );
  }
  const pessoas = await deps.banco.usuarios.contar();
  if (pessoas > 1) {
    throw new ErroApi(
      409,
      "n8n_usuario_obrigatorio",
      `há ${pessoas} pessoas cadastradas; defina N8N_USUARIO_ID com o id de quem recebe o conhecimento do n8n`,
    );
  }
  const primeira = await deps.banco.usuarios.primeiro();
  if (!primeira) {
    throw new ErroApi(
      409,
      "sem_usuario",
      "crie a primeira pessoa com `pnpm --filter @zentrade/api criar-usuario`",
    );
  }
  return primeira.id;
}

/**
 * Webhooks do n8n: sem sessão, mas assinados (HMAC de "carimbo.corpo"), com validade
 * de 5 minutos e uso único. A assinatura é conferida sobre o corpo cru, antes de
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
    { config: { acesso: "publico" }, schema: { body: ConhecimentoWebhookEsquema } },
    async (req, reply) => {
      const dona = await donaDoConhecimento(deps);
      const { url, ...resto } = req.body;
      const r = await deps.conhecimento.ingerir(dona, { ...resto, ...(url ? { url } : {}) });
      return reply.code(r.novo ? 201 : 200).send(r);
    },
  );

  app.post(
    "/saude",
    { config: { acesso: "publico" }, schema: { response: { 200: SaudeN8nEsquema } } },
    async () => ({
      motorVivoHaSegundos: await deps.saude.motorVivoHaSegundos(),
      robosPausados: await deps.banco.robos.contarPausados(),
    }),
  );
};
