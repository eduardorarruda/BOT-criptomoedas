import type { FastifyInstance } from "fastify";
import { Redis } from "ioredis";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { usuarioIdDe } from "../autenticacao/plugin.js";
import type { Dependencias } from "../dependencias.js";
import {
  armazemHistoricoRedis,
  criarHistoricoEventos,
  RegistroAoVivoEsquema,
  TETO_PADRAO,
  type HistoricoEventos,
  type RegistroAoVivo,
} from "../integracoes/historico-eventos.js";
import { exigirUuid, ouNaoEncontrado, ParamId } from "./comum.js";

const Limite = z.object({ limite: z.coerce.number().int().min(1).max(TETO_PADRAO).optional() });
const Resposta = z.object({ eventos: z.array(RegistroAoVivoEsquema) });

/** O robô de uma ordem antiga: a dona pela decisão e, como ela, a decisão. */
async function roboDaDecisao(deps: Dependencias, decisaoId: string): Promise<string | null> {
  const dona = await deps.banco.sistema.donoDaDecisao(decisaoId);
  return dona ? ((await deps.banco.decisoes.obter(dona, decisaoId))?.roboId ?? null) : null;
}

/**
 * Conexão própria, preguiçosa (só conecta no primeiro uso) e que desiste rápido:
 * o histórico é conveniência; Redis fora não pode travar a API nem a tela.
 */
function historicoNoRedis(app: FastifyInstance, deps: Dependencias): HistoricoEventos {
  const redis = new Redis(deps.config.REDIS_URL, {
    connectionName: "zentrade-api-aovivo",
    lazyConnect: true,
    maxRetriesPerRequest: 1,
  });
  redis.on("error", (erro: Error) => app.log.warn({ err: erro }, "Redis do histórico ao vivo com erro"));
  app.addHook("onClose", async () => {
    redis.disconnect();
  });
  return criarHistoricoEventos({
    armazem: armazemHistoricoRedis(redis),
    agora: deps.agora,
    log: app.log,
    roboDaDecisao: (id) => roboDaDecisao(deps, id),
    roboConhecido: async (id) => (await deps.banco.sistema.donoDoRobo(id)) !== null,
  });
}

const juntar = (listas: readonly RegistroAoVivo[][], limite: number): RegistroAoVivo[] =>
  listas
    .flat()
    .sort((a, b) => a.recebidoEm - b.recebidoEm)
    .slice(-limite);

/**
 * Ao vivo: o que os robôs da pessoa fizeram há pouco (candle, sinal, análise, risco,
 * ordem, posição), para a tela abrir preenchida. Depois disso, o WebSocket segue.
 */
export const rotasAoVivo: FastifyPluginAsyncZod<{ deps: Dependencias }> = async (app, { deps }) => {
  const historico = historicoNoRedis(app, deps);
  deps.hub.aoEvento((e) => historico.guardar(e));

  app.get(
    "/aovivo/:id/recentes",
    {
      config: { acesso: "leitura" },
      schema: { params: ParamId, querystring: Limite, response: { 200: Resposta } },
    },
    async (req) => {
      const roboId = exigirUuid(req.params.id, "robô");
      ouNaoEncontrado(await deps.banco.robos.obter(usuarioIdDe(req), roboId), "robô");
      return { eventos: await historico.recentes(roboId, req.query.limite) };
    },
  );

  app.get(
    "/aovivo/recentes",
    { config: { acesso: "leitura" }, schema: { querystring: Limite, response: { 200: Resposta } } },
    async (req) => {
      const limite = req.query.limite ?? TETO_PADRAO;
      const robos = await deps.banco.robos.listar(usuarioIdDe(req));
      const listas = await Promise.all(robos.map((r) => historico.recentes(r.id, limite)));
      return { eventos: juntar(listas, limite) };
    },
  );
};
