import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import websocket from "@fastify/websocket";
import Fastify, { type FastifyBaseLogger, type FastifyError, type FastifyInstance } from "fastify";
import {
  hasZodFastifySchemaValidationErrors,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import { z } from "zod";
import { CABECALHO_CSRF, registrarAutenticacao } from "./autenticacao/plugin.js";
import { chaveDoCliente } from "./chave-cliente.js";
import type { Dependencias } from "./dependencias.js";
import { corpoDoErro, ErroApi } from "./erros.js";
import { criarLog } from "./log.js";
import { rotasAoVivo } from "./rotas/aovivo.js";
import { rotasAssistente } from "./rotas/assistente.js";
import { rotasAssistenteMensagens } from "./rotas/assistente-mensagens.js";
import { rotasAutomacoes } from "./rotas/automacoes.js";
import { rotasBacktests } from "./rotas/backtests.js";
import { rotasBinance } from "./rotas/binance.js";
import { rotasCarteira } from "./rotas/carteira.js";
import { rotasClaudeToken } from "./rotas/claude-token.js";
import { rotasConhecimento } from "./rotas/conhecimento.js";
import { rotasConhecimentoArquivos } from "./rotas/conhecimento-arquivos.js";
import { rotasContas } from "./rotas/contas.js";
import { rotasDecisoes } from "./rotas/decisoes.js";
import { rotasEstrategias } from "./rotas/estrategias.js";
import { rotasImobiliario } from "./rotas/imobiliario.js";
import { rotasMercado } from "./rotas/mercado.js";
import { rotasParada } from "./rotas/parada.js";
import { rotasPatrimonio } from "./rotas/patrimonio.js";
import { rotasPluggy } from "./rotas/pluggy.js";
import { rotasPublico } from "./rotas/publico.js";
import { rotasRendaFixa } from "./rotas/renda-fixa.js";
import { rotasRisco } from "./rotas/risco.js";
import { rotasRobos } from "./rotas/robos.js";
import { rotasSaude } from "./rotas/saude.js";
import { rotasSegundoFator } from "./rotas/segundo-fator.js";
import { rotasSessao } from "./rotas/sessao.js";
import { rotasTempoReal } from "./rotas/tempo-real.js";
import { rotasTokens } from "./rotas/tokens.js";
import { rotasWebhooks } from "./rotas/webhooks.js";
import { confiancaNoProxy } from "./proxy.js";

z.config(z.locales.pt());

const LIMITE_GLOBAL = { max: 300, timeWindow: "1 minute" } as const;

function respostaDeErro(erro: FastifyError): { status: number; corpo: unknown } {
  if (hasZodFastifySchemaValidationErrors(erro)) {
    const problemas = erro.validation.map(
      (v) => `${v.instancePath.replace(/^\//, "") || "corpo"}: ${v.message}`,
    );
    return { status: 400, corpo: { erro: { codigo: "dados_invalidos", mensagem: problemas.join("; ") } } };
  }
  return corpoDoErro(erro);
}

async function registrarPlugins(app: FastifyInstance, deps: Dependencias): Promise<void> {
  await app.register(helmet);
  await app.register(cors, {
    origin: [deps.config.ZENTRADE_ORIGEM_WEB],
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["content-type", "authorization", CABECALHO_CSRF],
  });
  await app.register(cookie);
  await app.register(rateLimit, {
    ...LIMITE_GLOBAL,
    keyGenerator: chaveDoCliente,
    errorResponseBuilder: (_req, ctx) =>
      new ErroApi(
        429,
        "muitas_tentativas",
        `muitas tentativas seguidas; espere ${ctx.after} e tente de novo`,
      ),
  });
  await app.register(websocket, { options: { maxPayload: 64 * 1024 } });
}

/** Monta a API com as dependências recebidas. Não abre porta: quem chama decide (servidor ou teste). */
export async function construirApp(deps: Dependencias, log?: FastifyBaseLogger): Promise<FastifyInstance> {
  const app = Fastify({
    loggerInstance: log ?? criarLog(deps.config.LOG_LEVEL),
    bodyLimit: 1024 * 1024,
    trustProxy: confiancaNoProxy(deps.config.API_PROXY_CONFIAVEL),
  });
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.setErrorHandler((erro: FastifyError, req, reply) => {
    const { status, corpo } = respostaDeErro(erro);
    if (status >= 500) req.log.error({ err: erro }, "erro inesperado ao atender a requisição");
    return reply.code(status).send(corpo);
  });
  app.setNotFoundHandler((_req, reply) =>
    reply
      .code(404)
      .send({ erro: { codigo: "rota_inexistente", mensagem: "esse caminho não existe na API" } }),
  );
  await registrarPlugins(app, deps);
  registrarAutenticacao(app, deps);

  await app.register(
    async (api) => {
      const tipada = api.withTypeProvider<ZodTypeProvider>();
      for (const rotas of [
        rotasSessao,
        rotasSegundoFator,
        rotasEstrategias,
        rotasRobos,
        rotasDecisoes,
        rotasMercado,
        rotasParada,
        rotasRisco,
        rotasContas,
        rotasTokens,
        rotasBacktests,
        rotasConhecimento,
        rotasConhecimentoArquivos,
        rotasAssistente,
        rotasAssistenteMensagens,
        rotasClaudeToken,
        rotasAutomacoes,
        rotasCarteira,
        rotasBinance,
        rotasSaude,
        rotasPublico,
        rotasTempoReal,
        rotasAoVivo,
        rotasRendaFixa,
        rotasPluggy,
        rotasImobiliario,
        rotasPatrimonio,
      ]) {
        await tipada.register(rotas, { deps });
      }
    },
    { prefix: "/api/v1" },
  );
  await app.register(rotasWebhooks, { prefix: "/webhooks/n8n", deps });
  return app;
}
