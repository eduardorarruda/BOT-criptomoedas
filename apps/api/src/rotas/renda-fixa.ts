import {
  IndicadoresEsquema,
  MudancaTituloEsquema,
  NovoTituloEsquema,
  PremissasConsultaEsquema,
  RegrasTributariasEsquema,
  ResultadoIsentoEsquema,
  ResultadoPreIpcaEsquema,
  ResultadoSelicCdbPoupancaEsquema,
  ResumoRendaFixaEsquema,
  SimularIsentoEsquema,
  SimularPreIpcaEsquema,
  SimularSelicCdbPoupancaEsquema,
  TituloDetalheEsquema,
  TituloRendaFixaEsquema,
} from "@zentrade/contratos";
import { dec } from "@zentrade/dominio";
import { compararSelicCdbPoupanca, equivalenciaIsento, preVersusIpca } from "@zentrade/financas";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { usuarioIdDe } from "../autenticacao/plugin.js";
import type { Dependencias } from "../dependencias.js";
import { ErroApi, naoEncontrado } from "../erros.js";
import { resumirIndicadores } from "../integracoes/bcb-indices.js";
import { exigirUuid, ouNaoEncontrado, ParamId } from "./comum.js";
import { isentoDto, preIpcaDto, regrasDto, selicCdbPoupancaDto } from "./renda-fixa-conversao.js";
import {
  detalharTitulo,
  hojeEm,
  listarTitulos,
  resumoDaCarteira,
  tituloComPosicao,
} from "./renda-fixa-servico.js";

const LIMITE_ATUALIZAR = { max: 6, timeWindow: "1 minute" } as const;

/** Renda fixa: carteira, títulos manuais, índices do BCB, regras e simuladores. */
export const rotasRendaFixa: FastifyPluginAsyncZod<{ deps: Dependencias }> = async (app, { deps }) => {
  const { rendaFixa } = deps.banco;
  const titulo = (id: string) => exigirUuid(id, "título");

  app.get(
    "/renda-fixa/resumo",
    { config: { acesso: "leitura" }, schema: { response: { 200: ResumoRendaFixaEsquema } } },
    async (req) => resumoDaCarteira(deps, usuarioIdDe(req)),
  );

  app.get(
    "/renda-fixa/titulos",
    { config: { acesso: "leitura" }, schema: { response: { 200: z.array(TituloRendaFixaEsquema) } } },
    async (req) => listarTitulos(deps, usuarioIdDe(req)),
  );

  app.get(
    "/renda-fixa/titulos/:id",
    {
      config: { acesso: "leitura" },
      schema: {
        params: ParamId,
        querystring: PremissasConsultaEsquema,
        response: { 200: TituloDetalheEsquema },
      },
    },
    async (req) => {
      const linha = ouNaoEncontrado(await rendaFixa.obter(usuarioIdDe(req), titulo(req.params.id)), "título");
      const { cdi, selic, ipca, horizonteMeses } = req.query;
      return detalharTitulo(deps, linha, {
        ...(cdi ? { cdiAnual: dec(cdi) } : {}),
        ...(selic ? { selicAnual: dec(selic) } : {}),
        ...(ipca ? { ipcaAnual: dec(ipca) } : {}),
        ...(horizonteMeses ? { horizonteMeses } : {}),
      });
    },
  );

  app.post(
    "/renda-fixa/titulos",
    {
      config: { acesso: "operar" },
      schema: { body: NovoTituloEsquema, response: { 201: TituloRendaFixaEsquema } },
    },
    async (req, reply) => {
      const linha = await rendaFixa.criar(usuarioIdDe(req), req.body);
      return reply.code(201).send(await tituloComPosicao(deps, linha));
    },
  );

  app.patch(
    "/renda-fixa/titulos/:id",
    {
      config: { acesso: "operar" },
      schema: { params: ParamId, body: MudancaTituloEsquema, response: { 200: TituloRendaFixaEsquema } },
    },
    async (req) => {
      const usuarioId = usuarioIdDe(req);
      const id = titulo(req.params.id);
      const atual = ouNaoEncontrado(await rendaFixa.obter(usuarioId, id), "título");
      const juntado = NovoTituloEsquema.safeParse({ ...atual, ...req.body });
      if (!juntado.success) {
        throw new ErroApi(400, "dados_invalidos", juntado.error.issues.map((i) => i.message).join("; "));
      }
      return tituloComPosicao(
        deps,
        ouNaoEncontrado(await rendaFixa.atualizar(usuarioId, id, juntado.data), "título"),
      );
    },
  );

  app.delete(
    "/renda-fixa/titulos/:id",
    { config: { acesso: "operar" }, schema: { params: ParamId } },
    async (req, reply) => {
      if (!(await rendaFixa.remover(usuarioIdDe(req), titulo(req.params.id)))) throw naoEncontrado("título");
      return reply.code(204).send();
    },
  );

  app.get(
    "/renda-fixa/indicadores",
    { config: { acesso: "leitura" }, schema: { response: { 200: IndicadoresEsquema } } },
    async () => resumirIndicadores(deps.banco.indicadores, hojeEm(deps.agora())),
  );

  app.post(
    "/renda-fixa/indicadores/atualizar",
    {
      config: { acesso: "operar", rateLimit: LIMITE_ATUALIZAR },
      schema: { response: { 200: IndicadoresEsquema } },
    },
    async () => {
      if (!deps.rendaFixa) {
        throw new ErroApi(
          503,
          "indicadores_indisponiveis",
          "o atualizador dos índices do Banco Central não está ligado nesta API",
        );
      }
      await deps.rendaFixa.indicadores.atualizar();
      return resumirIndicadores(deps.banco.indicadores, hojeEm(deps.agora()));
    },
  );

  app.get(
    "/renda-fixa/regras",
    { config: { acesso: "leitura" }, schema: { response: { 200: RegrasTributariasEsquema } } },
    async () => regrasDto(),
  );

  const hoje = () => hojeEm(deps.agora());

  app.post(
    "/renda-fixa/simular/isento",
    {
      config: { acesso: "leitura" },
      schema: { body: SimularIsentoEsquema, response: { 200: ResultadoIsentoEsquema } },
    },
    async (req) => {
      const b = req.body;
      return isentoDto(
        equivalenciaIsento({
          direcao: b.direcao,
          percentualCdi: dec(b.percentualCdi),
          prazoDias: b.prazoDias,
          cdiAnual: dec(b.cdiAnual),
          inicio: hoje(),
        }),
      );
    },
  );

  app.post(
    "/renda-fixa/simular/selic-cdb-poupanca",
    {
      config: { acesso: "leitura" },
      schema: { body: SimularSelicCdbPoupancaEsquema, response: { 200: ResultadoSelicCdbPoupancaEsquema } },
    },
    async (req) => {
      const b = req.body;
      return selicCdbPoupancaDto(
        compararSelicCdbPoupanca({
          valor: dec(b.valor),
          inicio: hoje(),
          prazoDias: b.prazoDias,
          selicAnual: dec(b.selicAnual),
          cdiAnual: dec(b.cdiAnual),
          percentualCdb: dec(b.percentualCdb),
          metaSelicAnual: dec(b.metaSelicAnual),
          trMensal: dec(b.trMensal),
        }),
      );
    },
  );

  app.post(
    "/renda-fixa/simular/pre-ipca",
    {
      config: { acesso: "leitura" },
      schema: { body: SimularPreIpcaEsquema, response: { 200: ResultadoPreIpcaEsquema } },
    },
    async (req) => {
      const b = req.body;
      return preIpcaDto(
        preVersusIpca({
          valor: dec(b.valor),
          inicio: hoje(),
          prazoDias: b.prazoDias,
          taxaPre: dec(b.taxaPre),
          taxaReal: dec(b.taxaReal),
          ipcaEsperado: dec(b.ipcaEsperado),
        }),
      );
    },
  );
};
