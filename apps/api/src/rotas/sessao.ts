import type { Usuario } from "@zentrade/banco";
import { CODIGOS_ERRO, SessaoEsquema } from "@zentrade/contratos";
import type { FastifyReply } from "fastify";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { COOKIE_CSRF, COOKIE_SESSAO } from "../autenticacao/plugin.js";
import type { Dependencias } from "../dependencias.js";
import { ErroApi } from "../erros.js";
import { HASH_FALSO, verificarSenha } from "../seguranca/senha.js";
import { gerarToken, sha256 } from "../seguranca/tokens.js";
import { verificarCodigoTotp } from "../seguranca/totp.js";
import { LIMITE_LOGIN, publico, sessaoDe } from "./sessao-comum.js";

const DURACAO_SESSAO_MS = 12 * 3_600_000;
const Login = z.object({
  email: z.email("informe um e-mail válido").max(200),
  senha: z.string().min(1, "informe a senha").max(200),
  codigo2fa: z.string().max(10).optional(),
});

const credenciaisInvalidas = () =>
  new ErroApi(401, "credenciais_invalidas", "e-mail ou senha incorretos; confira e tente de novo");

async function conferirSegundoFator(deps: Dependencias, usuario: Usuario, codigo?: string): Promise<void> {
  if (!usuario.doisFatores) return;
  if (!codigo)
    throw new ErroApi(
      401,
      CODIGOS_ERRO.codigo2faNecessario,
      "informe o código de 6 dígitos do app autenticador",
    );
  const segredo = await deps.banco.usuarios.segredo2fa(usuario.id);
  if (!segredo || !(await verificarCodigoTotp(segredo, codigo))) {
    throw new ErroApi(
      401,
      "codigo_2fa_invalido",
      "código 2FA incorreto ou vencido; use o código atual do app",
    );
  }
}

export const rotasSessao: FastifyPluginAsyncZod<{ deps: Dependencias }> = async (app, { deps }) => {
  const seguro = deps.config.COOKIE_SEGURO;
  const cookie = (httpOnly: boolean) =>
    ({ path: "/", httpOnly, secure: seguro, sameSite: "strict", maxAge: DURACAO_SESSAO_MS / 1000 }) as const;

  async function abrirSessao(reply: FastifyReply, usuario: Usuario) {
    const token = gerarToken("zts_");
    const csrf = gerarToken("");
    await deps.banco.sessoes.criar({
      id: sha256(token),
      usuarioId: usuario.id,
      csrf,
      expiraEm: deps.agora() + DURACAO_SESSAO_MS,
      em: deps.agora(),
    });
    reply.setCookie(COOKIE_SESSAO, token, cookie(true)).setCookie(COOKIE_CSRF, csrf, cookie(false));
    return csrf;
  }

  app.post(
    "/sessao",
    {
      config: { acesso: "publico", rateLimit: LIMITE_LOGIN },
      schema: { body: Login, response: { 200: SessaoEsquema } },
    },
    async (req, reply) => {
      const encontrado = await deps.banco.usuarios.porEmail(req.body.email);
      // Confere contra um hash falso quando o e-mail não existe: mesmo tempo de resposta.
      const senhaOk = await verificarSenha(encontrado?.senhaHash ?? HASH_FALSO, req.body.senha);
      if (!encontrado || !senhaOk) {
        await deps.banco.auditoria.registrar({ usuarioId: encontrado?.id ?? null, acao: "login_recusado" });
        throw credenciaisInvalidas();
      }
      const { senhaHash: _, ...usuario } = encontrado;
      await conferirSegundoFator(deps, usuario, req.body.codigo2fa);
      const csrf = await abrirSessao(reply, usuario);
      await deps.banco.auditoria.registrar({ usuarioId: usuario.id, acao: "login" });
      return { usuario: publico(usuario), csrf };
    },
  );

  const resposta = { response: { 200: SessaoEsquema } };
  app.get("/sessao", { config: { acesso: "sessao" }, schema: resposta }, async (req) => {
    const s = sessaoDe(req);
    return { usuario: publico(s.usuario), csrf: s.csrf };
  });

  app.delete("/sessao", { config: { acesso: "sessao" } }, async (req, reply) => {
    const s = sessaoDe(req);
    await deps.banco.sessoes.remover(s.sessaoId);
    await deps.banco.auditoria.registrar({ usuarioId: s.usuario.id, acao: "logout" });
    reply.clearCookie(COOKIE_SESSAO, { path: "/" }).clearCookie(COOKIE_CSRF, { path: "/" });
    return reply.code(204).send();
  });
};
