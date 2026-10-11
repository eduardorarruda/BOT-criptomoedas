import {
  ConsultaImobiliarioEsquema,
  MudancaInvestimentoImobiliarioEsquema,
  NovoInvestimentoImobiliarioEsquema,
  NovoLancamentoImobiliarioEsquema,
} from "@zentrade/contratos";
import { visaoEmTexto } from "@zentrade/financas";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { usuarioIdDe } from "../autenticacao/plugin.js";
import type { Dependencias } from "../dependencias.js";
import { exigirUuid, ouNaoEncontrado, ParamId } from "./comum.js";
import {
  conferidor,
  cotacaoDe,
  cotacoesDosFiis,
  detalhe,
  hojeNoBrasil,
  item,
  type OpcoesCalculo,
} from "./imobiliario-servico.js";
import { rotasSimulacoesImobiliario } from "./imobiliario-simulacoes.js";

/**
 * Investimentos imobiliários da pessoa (RLS no banco), com as métricas calculadas na
 * hora pela data-base e pelo CDI informados. Leitura aceita token `leitura`; escrita,
 * sessão (com CSRF) ou token `operar`.
 */
type Tipada = Parameters<FastifyPluginAsyncZod>[0];

const ParamLancamento = z.object({ id: z.string().max(64), lancamentoId: z.string().max(64) });
const ConsultaCotacoes = z.object({ tickers: z.string().max(400) });
const BASE = "/imobiliario/investimentos";
const leitura = { config: { acesso: "leitura" as const } };
const operar = { config: { acesso: "operar" as const } };
const idDe = (bruto: string) => exigirUuid(bruto, "investimento");

function servico(deps: Dependencias) {
  const { imobiliario } = deps.banco;
  const opcoes = (c: z.infer<typeof ConsultaImobiliarioEsquema>): OpcoesCalculo => ({
    dataBase: c.dataBase ?? hojeNoBrasil(deps.agora()),
    cdiAnual: c.cdiAnual ?? null,
  });
  return {
    opcoes,
    conferir: () => conferidor(deps.agora()),
    async itens(usuarioId: string, o: OpcoesCalculo) {
      const registros = await imobiliario.listar(usuarioId);
      const cotacoes = await cotacoesDosFiis(deps.cotacoesB3, registros);
      return registros.map((r) => item(r, o, cotacaoDe(cotacoes, r)));
    },
    async detalhe(usuarioId: string, investimentoId: string, o: OpcoesCalculo) {
      const r = ouNaoEncontrado(await imobiliario.obter(usuarioId, investimentoId), "investimento");
      return detalhe(r, o, cotacaoDe(await cotacoesDosFiis(deps.cotacoesB3, [r]), r));
    },
  };
}

function rotasDeLeitura(app: Tipada, s: ReturnType<typeof servico>): void {
  app.get(
    "/imobiliario",
    { ...leitura, schema: { querystring: ConsultaImobiliarioEsquema } },
    async (req) => {
      const o = s.opcoes(req.query);
      const itens = await s.itens(usuarioIdDe(req), o);
      const visao = visaoEmTexto(
        itens.map((i) => ({ tipo: i.investimento.tipo, metricas: i.metricas })),
        o,
      );
      return { ...visao, itens };
    },
  );
  app.get(BASE, { ...leitura, schema: { querystring: ConsultaImobiliarioEsquema } }, async (req) =>
    s.itens(usuarioIdDe(req), s.opcoes(req.query)),
  );
  app.get(
    `${BASE}/:id`,
    { ...leitura, schema: { params: ParamId, querystring: ConsultaImobiliarioEsquema } },
    async (req) => s.detalhe(usuarioIdDe(req), idDe(req.params.id), s.opcoes(req.query)),
  );
}

function rotasDoCadastro(app: Tipada, deps: Dependencias, s: ReturnType<typeof servico>): void {
  const { imobiliario } = deps.banco;
  app.post(BASE, { ...operar, schema: { body: NovoInvestimentoImobiliarioEsquema } }, async (req, reply) => {
    const r = await imobiliario.criar(usuarioIdDe(req), req.body, s.conferir());
    return reply.code(201).send(detalhe(r, s.opcoes({}), null));
  });
  app.patch(
    `${BASE}/:id`,
    { ...operar, schema: { params: ParamId, body: MudancaInvestimentoImobiliarioEsquema } },
    async (req) => {
      const usuarioId = usuarioIdDe(req);
      await imobiliario.atualizar(usuarioId, idDe(req.params.id), req.body, s.conferir());
      return s.detalhe(usuarioId, req.params.id, s.opcoes({}));
    },
  );
  app.delete(`${BASE}/:id`, { ...operar, schema: { params: ParamId } }, async (req, reply) => {
    await imobiliario.remover(usuarioIdDe(req), idDe(req.params.id));
    return reply.code(204).send();
  });
}

function rotasDeLancamentos(app: Tipada, deps: Dependencias, s: ReturnType<typeof servico>): void {
  const { imobiliario } = deps.banco;
  app.post(
    `${BASE}/:id/lancamentos`,
    { ...operar, schema: { params: ParamId, body: NovoLancamentoImobiliarioEsquema } },
    async (req, reply) => {
      const id = idDe(req.params.id);
      const l = await imobiliario.adicionarLancamento(usuarioIdDe(req), id, req.body, s.conferir());
      return reply.code(201).send(l);
    },
  );
  app.delete(
    `${BASE}/:id/lancamentos/:lancamentoId`,
    { ...operar, schema: { params: ParamLancamento } },
    async (req, reply) => {
      const lancamentoId = exigirUuid(req.params.lancamentoId, "lançamento");
      await imobiliario.removerLancamento(usuarioIdDe(req), idDe(req.params.id), lancamentoId, s.conferir());
      return reply.code(204).send();
    },
  );
}

function rotaDeCotacoes(app: Tipada, deps: Dependencias): void {
  app.get("/imobiliario/cotacoes", { ...leitura, schema: { querystring: ConsultaCotacoes } }, async (req) => {
    const tickers = req.query.tickers.split(",").filter((t) => t.trim() !== "");
    const cliente = deps.cotacoesB3;
    if (!cliente) {
      const motivo = "cotações automáticas desligadas";
      return {
        configurado: false,
        cotacoes: [],
        indisponiveis: tickers.map((ticker) => ({ ticker, motivo })),
      };
    }
    const r = await cliente.cotar(tickers);
    const cotacoes = r.cotacoes.map((c) => ({ ...c, preco: c.preco.toFixed(), fonte: "brapi" as const }));
    return { configurado: cliente.configurado, cotacoes, indisponiveis: r.indisponiveis };
  });
}

export const rotasImobiliario: FastifyPluginAsyncZod<{ deps: Dependencias }> = async (app, { deps }) => {
  const s = servico(deps);
  rotasDeLeitura(app, s);
  rotasDoCadastro(app, deps, s);
  rotasDeLancamentos(app, deps, s);
  rotaDeCotacoes(app, deps);
  await app.register(rotasSimulacoesImobiliario);
};
