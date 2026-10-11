import {
  ConnectTokenEsquema,
  EstadoPluggyEsquema,
  PedidoConnectTokenEsquema,
  RegistrarItemEsquema,
  ResultadoSincronizacaoEsquema,
} from "@zentrade/contratos";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { usuarioIdDe } from "../autenticacao/plugin.js";
import type { Dependencias } from "../dependencias.js";
import { ErroApi, naoEncontrado } from "../erros.js";
import type { SincronizadorPluggy } from "../integracoes/pluggy-sincronizador.js";
import { exigirUuid, ParamId } from "./comum.js";

const LIMITE_PLUGGY = { max: 10, timeWindow: "1 minute" } as const;
const Sincronizar = z.object({ pedirAoBanco: z.boolean().optional() }).optional();

type App = Parameters<FastifyPluginAsyncZod<{ deps: Dependencias }>>[0];

function sincronizador(deps: Dependencias): SincronizadorPluggy {
  if (!deps.rendaFixa) {
    throw new ErroApi(503, "pluggy_nao_configurada", "a integração com a Pluggy não está ligada nesta API");
  }
  return deps.rendaFixa.pluggy;
}

const item = (id: string) => exigirUuid(id, "conexão");

/** Estado, connect token e conectar um item novo. */
function registrarConexao(app: App, deps: Dependencias): void {
  const pluggy = () => sincronizador(deps);
  app.get(
    "/pluggy",
    { config: { acesso: "leitura" }, schema: { response: { 200: EstadoPluggyEsquema } } },
    async (req) => ({
      configurada: deps.rendaFixa?.pluggy.configurada ?? false,
      itens: await deps.banco.pluggy.listar(usuarioIdDe(req)),
    }),
  );

  app.post(
    "/pluggy/connect-token",
    {
      config: { acesso: "sessao", rateLimit: LIMITE_PLUGGY },
      schema: { body: PedidoConnectTokenEsquema, response: { 200: ConnectTokenEsquema } },
    },
    async (req) => {
      const usuarioId = usuarioIdDe(req);
      const { itemId } = req.body;
      if (itemId && !(await deps.banco.pluggy.obter(usuarioId, itemId))) throw naoEncontrado("conexão");
      return { accessToken: await pluggy().connectToken(usuarioId, itemId) };
    },
  );

  app.post(
    "/pluggy/itens",
    {
      config: { acesso: "sessao", rateLimit: LIMITE_PLUGGY },
      schema: { body: RegistrarItemEsquema, response: { 201: ResultadoSincronizacaoEsquema } },
    },
    async (req, reply) => reply.code(201).send(await pluggy().registrar(usuarioIdDe(req), req.body.itemId)),
  );
}

/** Sincronizar e remover um item já conectado. */
function registrarItens(app: App, deps: Dependencias): void {
  const pluggy = () => sincronizador(deps);

  app.post(
    "/pluggy/itens/:id/sincronizar",
    {
      config: { acesso: "operar", rateLimit: LIMITE_PLUGGY },
      schema: { params: ParamId, body: Sincronizar, response: { 200: ResultadoSincronizacaoEsquema } },
    },
    async (req) => {
      const usuarioId = usuarioIdDe(req);
      const id = item(req.params.id);
      if (!(await deps.banco.pluggy.obter(usuarioId, id))) throw naoEncontrado("conexão");
      return pluggy().sincronizar(usuarioId, id, req.body?.pedirAoBanco ?? false);
    },
  );

  app.delete(
    "/pluggy/itens/:id",
    { config: { acesso: "sessao" }, schema: { params: ParamId } },
    async (req, reply) => {
      if (!(await deps.banco.pluggy.remover(usuarioIdDe(req), item(req.params.id))))
        throw naoEncontrado("conexão");
      return reply.code(204).send();
    },
  );
}

/**
 * Conexão com bancos pela Pluggy. O navegador só recebe o connect token (30 min);
 * o client secret fica na API. Remover aqui nunca apaga o item na Pluggy.
 */
export const rotasPluggy: FastifyPluginAsyncZod<{ deps: Dependencias }> = async (app, { deps }) => {
  registrarConexao(app, deps);
  registrarItens(app, deps);
};
