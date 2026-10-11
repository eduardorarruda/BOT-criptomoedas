import type { FastifyBaseLogger, FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { esquemaJson, executarFerramenta, type FerramentaLeitura } from "../ferramentas/index.js";
import type { SessoesPonte } from "./sessoes.js";

export const CAMINHO_PONTE = "/ponte/ferramentas";
export const CABECALHO_PONTE = "x-zentrade-ponte";

const LOCAIS = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

const negar = (resposta: FastifyReply) =>
  resposta
    .code(401)
    .send({ erro: { codigo: "nao_autorizado", mensagem: "sessão da ponte inválida ou encerrada" } });

/**
 * Só a ponte rodando nesta máquina, com o token da execução, alcança as ferramentas.
 * Premissa: o agente fala direto com o socket (sem proxy reverso na frente). Atrás de um
 * proxy no mesmo host, todo pedido chegaria de 127.0.0.1 e esta barreira viraria só o
 * token; nesse caso, não exponha /ponte no proxy.
 */
function sessao(req: FastifyRequest, sessoes: SessoesPonte): ReadonlyMap<string, FerramentaLeitura> | null {
  if (!LOCAIS.has(req.socket.remoteAddress ?? "")) return null;
  const acesso = req.headers[CABECALHO_PONTE];
  return sessoes.ferramentas(typeof acesso === "string" ? acesso : undefined);
}

/**
 * O outro lado da ponte MCP: o Claude Code chama a ponte (stdio), a ponte chama estas
 * rotas, e as ferramentas rodam AQUI, no agente, com o contexto da execução — as mesmas
 * do provedor "api", e cada chamada vira etapa ao vivo do mesmo jeito.
 */
export function registrarRotasPonte(
  app: FastifyInstance,
  sessoes: SessoesPonte,
  log: FastifyBaseLogger,
): void {
  app.get(CAMINHO_PONTE, async (req, resposta) => {
    const ferramentas = sessao(req, sessoes);
    if (!ferramentas) return negar(resposta);
    return [...ferramentas.values()].map((f) => ({
      nome: f.nome,
      descricao: f.descricao,
      inputSchema: esquemaJson(f),
    }));
  });

  app.post<{ Params: { nome: string }; Body: { entrada?: unknown } | null }>(
    `${CAMINHO_PONTE}/:nome`,
    async (req, resposta) => {
      const ferramentas = sessao(req, sessoes);
      if (!ferramentas) return negar(resposta);
      const f = ferramentas.get(req.params.nome);
      if (!f) return { ok: false, texto: `Ferramenta desconhecida: ${req.params.nome.slice(0, 60)}.` };
      return executarFerramenta(f, req.body?.entrada, (erro, nome) =>
        log.error({ err: erro, ferramenta: nome }, "ferramenta da ponte falhou"),
      );
    },
  );
}
