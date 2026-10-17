import {
  PedidoClaudeAgenteEsquema,
  PedidoCodigoClaudeAgenteEsquema,
  type ResultadoTesteClaude,
} from "@zentrade/contratos";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { LimiteAnalises } from "../../limite.js";
import { autorizado, erro } from "../../servidor.js";
import { ErroClaudeCli } from "../analista-cli.js";
import { ErroSemToken } from "../executor.js";
import type { ConexoesClaude } from "./conexoes.js";
import { ErroConexaoClaude } from "./conexoes.js";

export interface OpcoesRotasTokenClaude {
  readonly segredo: string;
  /** null = este agente não conecta pelo botão (sem Claude Code, `script` ou chave mestra). */
  readonly conexoes: Pick<ConexoesClaude, "iniciar" | "enviarCodigo" | "cancelar"> | null;
  /** null = este agente não usa o token das pessoas (sem Claude Code ou chave mestra). */
  readonly testar: ((usuarioId: string) => Promise<ResultadoTesteClaude>) | null;
}

const ParamConexao = z.object({ id: z.uuid() });
const SEM_CONEXAO =
  "Este servidor não conecta o Claude pelo botão (falta o Claude Code, o utilitário script ou a ZENTRADE_CHAVE_MESTRA no agente). Use a opção de colar o token.";
const SEM_TOKEN =
  "Este servidor não usa o token do Claude de cada pessoa (falta o Claude Code ou a ZENTRADE_CHAVE_MESTRA no agente).";

/** Erro em frase para a pessoa. Nunca leva a saída do CLI nem o token. */
function responderErro(e: unknown, resposta: FastifyReply) {
  if (e instanceof ErroConexaoClaude) return erro(resposta, e.status, e.codigo, e.message);
  if (e instanceof ErroSemToken) return erro(resposta, 404, "sem_token", e.message);
  if (e instanceof ErroClaudeCli) return erro(resposta, 502, `cli_${e.codigo}`, e.message);
  resposta.log.error({ tipo: e instanceof Error ? e.name : typeof e }, "falha no token do Claude");
  return erro(resposta, 500, "erro_interno", "Erro inesperado no agente. Tente de novo.");
}

/**
 * O Claude de cada pessoa, no agente (rede interna; quem chama é a API, que autentica a
 * pessoa e manda o usuarioId da sessão). Conexão pelo botão (setup-token num terminal do
 * agente) e o teste do token guardado.
 */
export function registrarRotasTokenClaude(app: FastifyInstance, o: OpcoesRotasTokenClaude): void {
  const limiteTeste = new LimiteAnalises(4, 30);
  /** Rota com o segredo: o handler roda; sem ele, 401. */
  const comSegredo =
    (handler: (req: FastifyRequest, resposta: FastifyReply) => Promise<unknown>) =>
    async (req: FastifyRequest, resposta: FastifyReply) =>
      autorizado(req.headers.authorization, o.segredo)
        ? handler(req, resposta)
        : erro(resposta, 401, "nao_autorizado", "Envie Authorization: Bearer com o AGENTE_SEGREDO.");

  app.post(
    "/assistente/claude-token/conexao",
    comSegredo(async (req, resposta) => {
      const p = PedidoClaudeAgenteEsquema.safeParse(req.body);
      if (!p.success) return erro(resposta, 400, "pedido_invalido", "Envie { usuarioId }.");
      if (!o.conexoes) return erro(resposta, 503, "conexao_indisponivel", SEM_CONEXAO);
      try {
        return resposta.code(201).send(await o.conexoes.iniciar(p.data.usuarioId));
      } catch (e) {
        return responderErro(e, resposta);
      }
    }),
  );

  app.post(
    "/assistente/claude-token/conexao/:id/codigo",
    comSegredo(async (req, resposta) => {
      const id = ParamConexao.safeParse(req.params);
      const p = PedidoCodigoClaudeAgenteEsquema.safeParse(req.body);
      if (!id.success || !p.success) {
        return erro(resposta, 400, "pedido_invalido", "Envie { usuarioId, codigo } e o id da conexão.");
      }
      if (!o.conexoes) return erro(resposta, 503, "conexao_indisponivel", SEM_CONEXAO);
      try {
        return await o.conexoes.enviarCodigo(p.data.usuarioId, id.data.id, p.data.codigo);
      } catch (e) {
        return responderErro(e, resposta);
      }
    }),
  );

  app.post(
    "/assistente/claude-token/conexao/:id/cancelar",
    comSegredo(async (req, resposta) => {
      const id = ParamConexao.safeParse(req.params);
      const p = PedidoClaudeAgenteEsquema.safeParse(req.body);
      if (!id.success || !p.success) return erro(resposta, 400, "pedido_invalido", "Envie { usuarioId }.");
      if (!o.conexoes || !(await o.conexoes.cancelar(p.data.usuarioId, id.data.id))) {
        return erro(resposta, 404, "conexao_nao_encontrada", "Essa conexão não existe mais.");
      }
      return resposta.code(204).send();
    }),
  );

  app.post(
    "/assistente/claude-token/testar",
    comSegredo(async (req, resposta) => {
      const p = PedidoClaudeAgenteEsquema.safeParse(req.body);
      if (!p.success) return erro(resposta, 400, "pedido_invalido", "Envie { usuarioId }.");
      if (!o.testar) return erro(resposta, 503, "token_indisponivel", SEM_TOKEN);
      if (!limiteTeste.entrar()) {
        return erro(resposta, 429, "limite_excedido", "Muitos testes ao mesmo tempo. Tente daqui a pouco.");
      }
      try {
        return await o.testar(p.data.usuarioId);
      } catch (e) {
        return responderErro(e, resposta);
      } finally {
        limiteTeste.sair();
      }
    }),
  );
}
