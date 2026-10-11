import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import type { Dependencias } from "../dependencias.js";

/** O motor bate no Redis periodicamente; sem batida há mais que isto, consideramos parado. */
export const MOTOR_VIVO_ATE_SEGUNDOS = 120;

export const rotasSaude: FastifyPluginAsyncZod<{ deps: Dependencias }> = async (app, { deps }) => {
  async function bancoOk(): Promise<boolean> {
    try {
      await deps.banco.sistema.ping();
      return true;
    } catch (erro) {
      app.log.error({ err: erro }, "banco não respondeu à checagem de saúde");
      return false;
    }
  }

  app.get("/saude", { config: { acesso: "publico" } }, async (_req, reply) => {
    const [banco, redis, motorHa, agente] = await Promise.all([
      bancoOk(),
      deps.saude.redis(),
      deps.saude.motorVivoHaSegundos(),
      deps.saude.agente(),
    ]);
    const motor = motorHa !== null && motorHa <= MOTOR_VIVO_ATE_SEGUNDOS;
    const ok = banco && redis;
    return reply
      .code(ok ? 200 : 503)
      .send({ ok, servicos: { banco, redis, motor, agente: agente ?? false } });
  });
};
