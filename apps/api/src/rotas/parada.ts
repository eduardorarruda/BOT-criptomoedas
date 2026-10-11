import { ParadaTotalEsquema } from "@zentrade/contratos";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { exigirReautenticacao, usuarioIdDe } from "../autenticacao/plugin.js";
import type { Dependencias } from "../dependencias.js";

export const rotasParada: FastifyPluginAsyncZod<{ deps: Dependencias }> = async (app, { deps }) => {
  const response = { 200: ParadaTotalEsquema };
  app.get("/parada-total", { config: { acesso: "leitura" }, schema: { response } }, async (req) => ({
    ligada: await deps.banco.configuracao.paradaTotal(usuarioIdDe(req)),
  }));

  // Ligar é sempre permitido (até por token "operar"): parar nunca deve ter atrito.
  // Desligar é crítico e exige reautenticação.
  app.post(
    "/parada-total",
    { config: { acesso: "operar" }, schema: { body: ParadaTotalEsquema, response } },
    async (req) => {
      if (!req.body.ligada) exigirReautenticacao(req, deps.agora());
      const usuarioId = usuarioIdDe(req);
      const ligada = await deps.banco.configuracao.definirParadaTotal(usuarioId, req.body.ligada);
      try {
        await deps.n8n.enviarAlerta({
          tipo: "parada_total",
          titulo: ligada ? "Parada total ligada" : "Parada total desligada",
          mensagem: ligada
            ? "Nenhum robô envia ordem até alguém desligar a parada."
            : "Os robôs voltaram a poder operar.",
          em: deps.agora(),
        });
      } catch (erro) {
        req.log.error({ err: erro }, "alerta de parada total não chegou ao n8n");
      }
      return { ligada };
    },
  );
};
