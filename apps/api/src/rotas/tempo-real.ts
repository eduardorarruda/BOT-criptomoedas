import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { usuarioIdDe, type Autenticacao } from "../autenticacao/plugin.js";
import type { Dependencias } from "../dependencias.js";
import { proibido } from "../erros.js";

/** Padrão: confere a cada 30 s se a sessão (ou o token) ainda vale. */
export const VERIFICACAO_TEMPO_REAL_MS = 30_000;
/** Código de fechamento quando a sessão venceu, saiu ou o token foi revogado. */
export const FECHAMENTO_SESSAO_ENCERRADA = 4401;
/** Código de fechamento quando não deu para conferir (banco fora): fecha por segurança. */
export const FECHAMENTO_FALHA_VERIFICACAO = 1011;

/** A credencial que abriu o WebSocket ainda vale? Sessão vencida, encerrada ou token revogado: não. */
async function aindaVale(deps: Dependencias, a: Autenticacao): Promise<boolean> {
  if (a.via === "sessao") return (await deps.banco.sessoes.obter(a.sessaoId, deps.agora())) !== null;
  return deps.banco.tokens.existe(a.tokenId);
}

/**
 * WebSocket de eventos ao vivo. Navegador sempre manda cookie no upgrade, de
 * qualquer site: por isso, com sessão, a origem precisa ser a da tela (evita
 * sequestro de WebSocket entre sites). A conexão fecha sozinha quando a sessão
 * vence ou é encerrada, ou quando o token é revogado (checagem periódica).
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
      const autenticacao = req.autenticacao;
      const sair = deps.hub.registrar(usuarioIdDe(req), (texto) => {
        if (socket.readyState === socket.OPEN) socket.send(texto);
      });
      const conferir = async () => {
        if (!autenticacao || socket.readyState !== socket.OPEN) return;
        try {
          if (!(await aindaVale(deps, autenticacao))) {
            socket.close(FECHAMENTO_SESSAO_ENCERRADA, "sessão encerrada; entre de novo");
          }
        } catch (erro) {
          req.log.error({ err: erro }, "não deu para conferir a sessão do tempo real; conexão fechada");
          socket.close(FECHAMENTO_FALHA_VERIFICACAO, "não deu para conferir a sessão");
        }
      };
      const relogio = setInterval(
        () => void conferir(),
        deps.verificacaoTempoRealMs ?? VERIFICACAO_TEMPO_REAL_MS,
      );
      relogio.unref();
      const encerrar = () => {
        clearInterval(relogio);
        sair();
      };
      socket.on("close", encerrar);
      socket.on("error", (erro: Error) => {
        req.log.warn({ err: erro }, "erro no WebSocket de tempo real");
        encerrar();
      });
    },
  );
};
