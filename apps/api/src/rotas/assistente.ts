import {
  ConversaEsquema,
  ConversaResumoEsquema,
  EstadoAssistenteEsquema,
  MudancaConfigAssistenteEsquema,
  MudancaConversaEsquema,
  NovaConversaEsquema,
  type ConfigAssistente,
  type EstadoAgenteAssistente,
  type EstadoAssistente,
  type MudancaConfigAssistente,
} from "@zentrade/contratos";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { usuarioIdDe } from "../autenticacao/plugin.js";
import type { Dependencias } from "../dependencias.js";
import { ErroApi, naoEncontrado } from "../erros.js";
import { exigirUuid, ouNaoEncontrado, ParamId } from "./comum.js";

const SEM_AGENTE: EstadoAgenteAssistente = {
  provedores: { api: false, cli: false },
  provedorPadrao: "api",
  contasCli: [],
  modelos: { api: [], cli: [] },
};

export const TITULO_PADRAO = "Nova conversa";

/** A escolha da pessoa (ou o padrão do agente para quem nunca escolheu) e se ela conectou o Claude. */
async function estadoDa(deps: Dependencias, usuarioId: string): Promise<EstadoAssistente> {
  const [agente, gravada, token] = await Promise.all([
    deps.assistente?.estado() ?? Promise.resolve(null),
    deps.banco.assistente.configGravada(usuarioId),
    deps.banco.credenciaisClaude.estado(usuarioId),
  ]);
  const base = agente ?? SEM_AGENTE;
  const config: ConfigAssistente = gravada ?? { provedor: base.provedorPadrao, modelo: null, contaCli: null };
  return {
    ...base,
    config,
    agenteNoAr: agente !== null,
    tokenClaudeFinal: token.final,
    claudeExige2fa: deps.config.CLAUDE_EXIGE_2FA,
  };
}

/** Só aceita provedor e conta que o agente diz ter; sem agente no ar, não dá para conferir. */
function conferirMudanca(agente: EstadoAgenteAssistente | null, m: MudancaConfigAssistente): void {
  if (!agente) {
    throw new ErroApi(
      503,
      "agente_fora_do_ar",
      "o agente de IA não respondeu; tente de novo quando ele voltar",
    );
  }
  if (m.provedor && !agente.provedores[m.provedor]) {
    const qual =
      m.provedor === "api"
        ? "a API da Anthropic (falta ANTHROPIC_API_KEY)"
        : "o Claude Code (CLI não instalado)";
    throw new ErroApi(409, "provedor_indisponivel", `este servidor não tem ${qual}`);
  }
  if (m.contaCli && !agente.contasCli.some((c) => c.id === m.contaCli)) {
    throw new ErroApi(
      409,
      "conta_cli_inexistente",
      `a conta "${m.contaCli}" do Claude Code não existe neste servidor`,
    );
  }
}

type App = Parameters<FastifyPluginAsyncZod<{ deps: Dependencias }>>[0];

function registrarConfig(app: App, deps: Dependencias): void {
  app.get(
    "/assistente/config",
    { config: { acesso: "leitura" }, schema: { response: { 200: EstadoAssistenteEsquema } } },
    async (req) => estadoDa(deps, usuarioIdDe(req)),
  );

  app.patch(
    "/assistente/config",
    {
      config: { acesso: "sessao" },
      schema: { body: MudancaConfigAssistenteEsquema, response: { 200: EstadoAssistenteEsquema } },
    },
    async (req) => {
      conferirMudanca((await deps.assistente?.estado()) ?? null, req.body);
      await deps.banco.assistente.salvarConfig(usuarioIdDe(req), req.body);
      return estadoDa(deps, usuarioIdDe(req));
    },
  );
}

function registrarLeituras(app: App, deps: Dependencias): void {
  const { assistente } = deps.banco;
  app.get(
    "/assistente/conversas",
    { config: { acesso: "leitura" }, schema: { response: { 200: z.array(ConversaResumoEsquema) } } },
    async (req) => assistente.listarConversas(usuarioIdDe(req)),
  );

  app.get(
    "/assistente/conversas/:id",
    { config: { acesso: "leitura" }, schema: { params: ParamId, response: { 200: ConversaEsquema } } },
    async (req) =>
      ouNaoEncontrado(
        await assistente.obterConversa(usuarioIdDe(req), exigirUuid(req.params.id, "conversa")),
        "conversa",
      ),
  );
}

function registrarEscritas(app: App, deps: Dependencias): void {
  const { assistente } = deps.banco;
  app.post(
    "/assistente/conversas",
    {
      config: { acesso: "sessao" },
      schema: { body: NovaConversaEsquema.optional(), response: { 201: ConversaResumoEsquema } },
    },
    async (req, reply) =>
      reply
        .code(201)
        .send(await assistente.criarConversa(usuarioIdDe(req), req.body?.titulo ?? TITULO_PADRAO)),
  );

  app.patch(
    "/assistente/conversas/:id",
    {
      config: { acesso: "sessao" },
      schema: { params: ParamId, body: MudancaConversaEsquema, response: { 200: ConversaResumoEsquema } },
    },
    async (req) =>
      ouNaoEncontrado(
        await assistente.renomearConversa(
          usuarioIdDe(req),
          exigirUuid(req.params.id, "conversa"),
          req.body.titulo,
        ),
        "conversa",
      ),
  );

  app.delete(
    "/assistente/conversas/:id",
    { config: { acesso: "sessao" }, schema: { params: ParamId } },
    async (req, reply) => {
      if (!(await assistente.apagarConversa(usuarioIdDe(req), exigirUuid(req.params.id, "conversa")))) {
        throw naoEncontrado("conversa");
      }
      return reply.code(204).send();
    },
  );
}

/** Configuração do assistente e conversas. Mensagens (com a resposta em streaming) em assistente-mensagens.ts. */
export const rotasAssistente: FastifyPluginAsyncZod<{ deps: Dependencias }> = async (app, { deps }) => {
  registrarConfig(app, deps);
  registrarLeituras(app, deps);
  registrarEscritas(app, deps);
};
