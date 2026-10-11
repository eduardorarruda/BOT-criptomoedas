import { Intervalo } from "@zentrade/contratos";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { usuarioIdDe } from "../autenticacao/plugin.js";
import type { Dependencias } from "../dependencias.js";
import { ErroApi } from "../erros.js";
import { exigirUuid, ouNaoEncontrado, ParamId } from "./comum.js";

const PedidoBacktest = z.object({
  estrategiaId: z.uuid("estrategiaId precisa ser o id de uma estratégia"),
  versao: z.number().int().positive(),
  simbolo: z.string().regex(/^[A-Z0-9]{5,20}$/, "símbolo como BTCUSDT"),
  intervalo: Intervalo,
  inicio: z.number().int().nonnegative(),
  fim: z.number().int().nonnegative(),
});

export const rotasBacktests: FastifyPluginAsyncZod<{ deps: Dependencias }> = async (app, { deps }) => {
  const { backtests } = deps.banco;

  app.post(
    "/backtests",
    { config: { acesso: "operar" }, schema: { body: PedidoBacktest } },
    async (req, reply) => {
      const criado = await backtests.criar(usuarioIdDe(req), req.body);
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
      return reply.code(202).send(criado);
    },
  );

  app.get("/backtests/:id", { config: { acesso: "leitura" }, schema: { params: ParamId } }, async (req) =>
    ouNaoEncontrado(
      await backtests.obter(usuarioIdDe(req), exigirUuid(req.params.id, "backtest")),
      "backtest",
    ),
  );
};
