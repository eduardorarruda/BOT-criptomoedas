import {
  EstadoMt5Esquema,
  ImportacaoB3Esquema,
  NovasCredenciaisMt5Esquema,
  ocultarSenhaMt5,
  TesteMt5Esquema,
} from "@zentrade/contratos";
import { exigirFuso } from "@zentrade/dominio";
import type { FastifyRequest } from "fastify";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { exigirReautenticacao, usuarioIdDe } from "../autenticacao/plugin.js";
import { chaveDoCliente } from "../chave-cliente.js";
import type { Dependencias } from "../dependencias.js";
import { ErroApi, naoEncontrado } from "../erros.js";

const porPessoa = (req: FastifyRequest): string =>
  req.autenticacao?.via === "sessao" ? `pessoa:${req.autenticacao.usuario.id}` : chaveDoCliente(req);
const LIMITE_TESTE = { max: 5, timeWindow: "1 minute", keyGenerator: porPessoa } as const;
const LIMITE_ATUALIZAR = { max: 6, timeWindow: "1 hour", keyGenerator: porPessoa } as const;
const NOME_ATUALIZACAO = "MetaTrader 5 (WIN)";
const DESLOCAMENTO = /^[+-](0\d|1[0-4]):[0-5]\d$/;

/** Fuso do servidor: nome IANA, "UTC" ou deslocamento fixo (+03:00). Outra coisa é erro de digitação. */
function conferirFuso(texto: string | undefined): void {
  if (texto === undefined || texto === "UTC" || DESLOCAMENTO.test(texto)) return;
  try {
    if (texto.includes("/")) {
      exigirFuso(texto);
      return;
    }
  } catch {
    /* cai no erro abaixo */
  }
  throw new ErroApi(
    400,
    "fuso_invalido",
    `fuso desconhecido: "${texto}". Use um nome IANA (Europe/Athens) ou um deslocamento como +03:00; vazio detecta sozinho.`,
  );
}

/**
 * MetaTrader 5 (dados do mini índice). Conta DEMO de corretora, só leitura de dados: o
 * conector nunca envia ordem. A senha entra pelo PUT e nunca volta; guardar exige
 * identidade confirmada nos últimos 5 minutos, como as chaves da Binance.
 */
export const rotasDadosMt5: FastifyPluginAsyncZod<{ deps: Dependencias }> = async (app, { deps }) => {
  const repo = () => {
    if (!deps.banco.credenciaisMt5)
      throw new ErroApi(503, "mt5_indisponivel", "a chave mestra não está configurada");
    return deps.banco.credenciaisMt5;
  };

  app.get(
    "/dados-mt5",
    { config: { acesso: "sessao" }, schema: { response: { 200: EstadoMt5Esquema } } },
    async (req) => repo().estado(usuarioIdDe(req)),
  );

  app.put(
    "/dados-mt5",
    {
      config: { acesso: "sessao" },
      schema: { body: NovasCredenciaisMt5Esquema, response: { 200: EstadoMt5Esquema } },
    },
    async (req) => {
      exigirReautenticacao(req, deps.agora());
      conferirFuso(req.body.fusoServidor);
      return repo().salvar(usuarioIdDe(req), req.body);
    },
  );

  app.delete("/dados-mt5", { config: { acesso: "sessao" } }, async (req, reply) => {
    if (!(await repo().remover(usuarioIdDe(req)))) throw naoEncontrado("conta do MetaTrader 5");
    return reply.code(204).send();
  });

  app.post(
    "/dados-mt5/testar",
    {
      config: { acesso: "sessao", rateLimit: LIMITE_TESTE },
      schema: { response: { 200: TesteMt5Esquema } },
    },
    async (req) => {
      const usuarioId = usuarioIdDe(req);
      const conta = await repo().credenciais(usuarioId);
      if (!conta) throw naoEncontrado("conta do MetaTrader 5");
      if (!deps.testarMt5)
        throw new ErroApi(
          503,
          "coletor_mt5_indisponivel",
          "o coletor do MetaTrader 5 não está ligado: suba o perfil mt5 do compose e defina COLETOR_MT5_URL na API (veja docs/dados-b3.md)",
        );
      try {
        const simbolos = await deps.testarMt5(conta);
        await repo().registrarTeste(usuarioId, { ok: true });
        return { ok: true, simbolos, erro: null };
      } catch (e) {
        const erro = ocultarSenhaMt5((e as Error).message, conta.senha);
        await repo().registrarTeste(usuarioId, { ok: false, erro });
        return { ok: false, simbolos: [], erro };
      }
    },
  );

  // Escopo "operar": consome o coletor e a CPU do motor. O andamento sai em GET /dados-b3/importacoes/:id.
  app.post(
    "/dados-mt5/atualizar",
    {
      config: { acesso: "operar", rateLimit: LIMITE_ATUALIZAR },
      schema: { response: { 202: ImportacaoB3Esquema } },
    },
    async (req, reply) => {
      const usuarioId = usuarioIdDe(req);
      if (!deps.filaAtualizacoesMt5)
        throw new ErroApi(503, "fila_indisponivel", "a fila de atualizações não está configurada");
      if (!(await repo().estado(usuarioId)).configurado)
        throw new ErroApi(
          409,
          "mt5_sem_conta",
          "cadastre a conta demo do MetaTrader 5 em Contas e chaves antes",
        );
      const criada = await deps.banco.importacoesB3.criar(usuarioId, NOME_ATUALIZACAO, "");
      try {
        await deps.filaAtualizacoesMt5.adicionar(criada.id);
      } catch (erro) {
        req.log.error(
          { err: erro, importacaoId: criada.id },
          "não foi possível enfileirar a atualização do WIN",
        );
        await deps.banco.importacoesB3.falhar(criada.id, "a fila de atualizações estava indisponível");
        throw new ErroApi(503, "fila_indisponivel", "a fila está fora do ar; tente de novo em instantes");
      }
      return reply.code(202).send(criada);
    },
  );
};
