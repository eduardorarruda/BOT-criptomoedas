import type { Usuario } from "@zentrade/banco";
import { SegredoDoisFatoresEsquema } from "@zentrade/contratos";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { REAUTENTICACAO_MS } from "../autenticacao/plugin.js";
import type { Dependencias } from "../dependencias.js";
import { ErroApi } from "../erros.js";
import { HASH_FALSO, verificarSenha } from "../seguranca/senha.js";
import { gerarSegredoTotp, uriTotp, verificarCodigoTotp } from "../seguranca/totp.js";
import { LIMITE_SESSAO, sessaoDe } from "./sessao-comum.js";

const Confirmacao = z
  .object({ senha: z.string().min(1).max(200).optional(), codigo2fa: z.string().max(10).optional() })
  .refine((c) => c.senha !== undefined || c.codigo2fa !== undefined, {
    error: "envie { senha } ou { codigo2fa }",
  });

/** Reautenticação (para ações críticas) e configuração do 2FA TOTP. */
export const rotasSegundoFator: FastifyPluginAsyncZod<{ deps: Dependencias }> = async (app, { deps }) => {
  app.post(
    "/sessao/confirmar",
    { config: { acesso: "sessao", rateLimit: LIMITE_SESSAO }, schema: { body: Confirmacao } },
    async (req, reply) => {
      const s = sessaoDe(req);
      const ok =
        req.body.codigo2fa !== undefined
          ? await confirmarComCodigo(deps, s.usuario, req.body.codigo2fa)
          : await verificarSenha(
              (await deps.banco.usuarios.senhaHash(s.usuario.id)) ?? HASH_FALSO,
              req.body.senha ?? "",
            );
      if (!ok) {
        await deps.banco.auditoria.registrar({ usuarioId: s.usuario.id, acao: "reautenticacao_recusada" });
        throw new ErroApi(401, "confirmacao_invalida", "senha ou código incorreto; nada foi liberado");
      }
      await deps.banco.sessoes.reautenticar(s.sessaoId, deps.agora());
      await deps.banco.auditoria.registrar({ usuarioId: s.usuario.id, acao: "reautenticacao" });
      return reply
        .code(204)
        .header("x-reautenticada-ate", String(deps.agora() + REAUTENTICACAO_MS))
        .send();
    },
  );

  const segredo2fa = { response: { 200: SegredoDoisFatoresEsquema } };
  app.post(
    "/sessao/2fa",
    { config: { acesso: "sessao", critica: true }, schema: segredo2fa },
    async (req) => {
      const s = sessaoDe(req);
      if (s.usuario.doisFatores) {
        throw new ErroApi(
          409,
          "2fa_ja_ativo",
          "o 2FA já está ativo; para trocar o app, fale com quem administra o servidor",
        );
      }
      const segredo = gerarSegredoTotp();
      await deps.banco.usuarios.definirSegredo2fa(s.usuario.id, segredo);
      return { segredo, uri: uriTotp(segredo, s.usuario.email) };
    },
  );

  app.post(
    "/sessao/2fa/ativar",
    {
      config: { acesso: "sessao", rateLimit: LIMITE_SESSAO },
      schema: { body: z.object({ codigo: z.string().max(10) }) },
    },
    async (req, reply) => {
      const s = sessaoDe(req);
      const segredo = await deps.banco.usuarios.segredo2fa(s.usuario.id);
      if (!segredo)
        throw new ErroApi(409, "2fa_nao_iniciado", "comece por POST /api/v1/sessao/2fa para gerar o segredo");
      if (!(await verificarCodigoTotp(segredo, req.body.codigo))) {
        throw new ErroApi(
          401,
          "codigo_2fa_invalido",
          "código incorreto; confira se o app foi configurado com o segredo novo",
        );
      }
      await deps.banco.usuarios.ativar2fa(s.usuario.id);
      await deps.banco.auditoria.registrar({ usuarioId: s.usuario.id, acao: "2fa_ativado" });
      return reply.code(204).send();
    },
  );
};

/** Com 2FA ativo, o código vale como confirmação; sem 2FA, só a senha. */
async function confirmarComCodigo(deps: Dependencias, usuario: Usuario, codigo: string): Promise<boolean> {
  if (!usuario.doisFatores) return false;
  const segredo = await deps.banco.usuarios.segredo2fa(usuario.id);
  return segredo !== null && (await verificarCodigoTotp(segredo, codigo));
}
