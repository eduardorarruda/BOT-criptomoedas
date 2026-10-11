import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { usuarioIdDe } from "../autenticacao/plugin.js";
import type { Dependencias } from "../dependencias.js";
import { proibido } from "../erros.js";

/**
 * WebSocket de eventos ao vivo. Navegador sempre manda cookie no upgrade, de
 * qualquer site: por isso, com sessão, a origem precisa ser a da tela (evita
 * sequestro de WebSocket entre sites).
 */
export const rotasTempoReal: FastifyPluginAsyncZod<{ deps: Dependencias }> = async (app, { deps }) => {
  app.get(
    "/tempo-real",
    {
      websocket: true,
      config: { acesso: "leitura" },
      preValidation: async (req) => {
        if (req.autenticacao?.via === "sessao" && req.headers.origin !== deps.config.ZENTRADE_ORIGEM_WEB) {
          throw proibido("origem_invalida", "o tempo real só aceita conexões vindas da tela do ZenTrade");
        }
      },
    },
    (socket, req) => {
      const sair = deps.hub.registrar(usuarioIdDe(req), (texto) => {
        if (socket.readyState === socket.OPEN) socket.send(texto);
      });
      socket.on("close", sair);
      socket.on("error", (erro: Error) => {
        req.log.warn({ err: erro }, "erro no WebSocket de tempo real");
        sair();
      });
    },
  );
};
