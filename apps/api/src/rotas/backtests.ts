import { BacktestEsquema, PedidoBacktestEsquema } from "@zentrade/contratos";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { usuarioIdDe } from "../autenticacao/plugin.js";
import type { Dependencias } from "../dependencias.js";
import { ErroApi } from "../erros.js";
import { exigirUuid, ouNaoEncontrado, ParamId } from "./comum.js";

/** Backtest guarda a curva inteira: a lista tem teto menor que as outras. */
const LIMITE_LISTA_BACKTESTS = 50;
const Lista = z.object({ limite: z.coerce.number().int().min(1).max(LIMITE_LISTA_BACKTESTS).optional() });

export const rotasBacktests: FastifyPluginAsyncZod<{ deps: Dependencias }> = async (app, { deps }) => {
  const { backtests } = deps.banco;

  app.get(
    "/backtests",
    {
      config: { acesso: "leitura" },
      schema: { querystring: Lista, response: { 200: z.array(BacktestEsquema) } },
    },
    async (req) => backtests.listar(usuarioIdDe(req), req.query.limite ?? 20),
  );

  // Escopo "operar": backtest não envia ordem, mas consome CPU do motor e dados da corretora.
  app.post(
    "/backtests",
    {
      config: { acesso: "operar" },
      schema: { body: PedidoBacktestEsquema, response: { 202: BacktestEsquema } },
    },
    async (req, reply) => {
      const usuarioId = usuarioIdDe(req);
      const criado = await backtests.criar(usuarioId, req.body);
      try {
        await deps.fila.adicionar(criado.id);
      } catch (erro) {
        req.log.error({ err: erro, backtestId: criado.id }, "não foi possível enfileirar o backtest");
        await backtests.falhar(criado.id, "a fila de backtests estava indisponível");
        throw new ErroApi(
          503,
          "fila_indisponivel",
          "a fila de backtests está fora do ar; tente de novo em instantes",
        );
      }
      return reply.code(202).send(ouNaoEncontrado(await backtests.obter(usuarioId, criado.id), "backtest"));
    },
  );

  app.get(
    "/backtests/:id",
    { config: { acesso: "leitura" }, schema: { params: ParamId, response: { 200: BacktestEsquema } } },
    async (req) =>
      ouNaoEncontrado(
        await backtests.obter(usuarioIdDe(req), exigirUuid(req.params.id, "backtest")),
        "backtest",
      ),
  );
};
