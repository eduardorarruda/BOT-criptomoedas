import { EstadoDecisao, FiltroPlacarEsquema, placarParaDTO } from "@zentrade/contratos";
import { calcularPlacar } from "@zentrade/dominio";
import { LIMITE_MAXIMO_LISTA } from "@zentrade/banco";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { autorDe, usuarioIdDe } from "../autenticacao/plugin.js";
import type { Dependencias } from "../dependencias.js";
import { exigirUuid, ouNaoEncontrado, ParamId } from "./comum.js";

const Limite = z.coerce.number().int().min(1).max(LIMITE_MAXIMO_LISTA).optional();
const FiltroDecisoes = z.object({
  roboId: z.uuid("roboId precisa ser o id de um robô").optional(),
  estado: EstadoDecisao.optional(),
  antes: z.coerce.number().int().nonnegative().optional(),
  limite: Limite,
});
const FiltroOrdens = z.object({
  roboId: z.uuid("roboId precisa ser o id de um robô").optional(),
  limite: Limite,
});

export const rotasDecisoes: FastifyPluginAsyncZod<{ deps: Dependencias }> = async (app, { deps }) => {
  const { decisoes, ordens, placar } = deps.banco;

  app.get(
    "/decisoes",
    { config: { acesso: "leitura" }, schema: { querystring: FiltroDecisoes } },
    async (req) => {
      const { roboId, estado, antes, limite } = req.query;
      return decisoes.listar(usuarioIdDe(req), {
        ...(roboId ? { roboId } : {}),
        ...(estado ? { estado } : {}),
        ...(antes !== undefined ? { antes } : {}),
        ...(limite !== undefined ? { limite } : {}),
      });
    },
  );

  /**
   * O placar do Claude: precisão das aprovações (com intervalo de Wilson), vetos certos,
   * dinheiro contra aprovar tudo, payoff, calibração e o limite de confiança sugerido —
   * no total, por robô, por estratégia e por mercado. Só as decisões da pessoa (RLS).
   */
  app.get(
    "/decisoes/placar",
    { config: { acesso: "leitura" }, schema: { querystring: FiltroPlacarEsquema } },
    async (req) => {
      const { roboId, desde } = req.query;
      const lista = await placar.decisoes(usuarioIdDe(req), {
        ...(roboId ? { roboId } : {}),
        ...(desde !== undefined ? { desde } : {}),
      });
      return placarParaDTO(calcularPlacar(lista), deps.agora());
    },
  );

  app.get("/decisoes/:id", { config: { acesso: "leitura" }, schema: { params: ParamId } }, async (req) =>
    ouNaoEncontrado(await decisoes.obter(usuarioIdDe(req), exigirUuid(req.params.id, "decisão")), "decisão"),
  );

  for (const [acao, aprovada] of [
    ["aprovar", true],
    ["recusar", false],
  ] as const) {
    app.post(
      `/decisoes/:id/${acao}`,
      { config: { acesso: "operar" }, schema: { params: ParamId } },
      async (req) =>
        decisoes.decidir(
          usuarioIdDe(req),
          exigirUuid(req.params.id, "decisão"),
          aprovada,
          autorDe(req),
          deps.agora(),
        ),
    );
  }

  app.get(
    "/ordens",
    { config: { acesso: "leitura" }, schema: { querystring: FiltroOrdens } },
    async (req) => {
      const { roboId, limite } = req.query;
      return ordens.listar(usuarioIdDe(req), {
        ...(roboId ? { roboId } : {}),
        ...(limite !== undefined ? { limite } : {}),
      });
    },
  );
};
