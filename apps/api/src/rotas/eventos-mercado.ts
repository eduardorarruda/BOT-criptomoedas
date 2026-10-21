import {
  ConsultaAgendaEsquema,
  EventoMercadoEsquema,
  NovoEventoMercadoEsquema,
  type EventoMercadoDTO,
} from "@zentrade/contratos";
import { diaNoFuso } from "@zentrade/dominio";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { usuarioIdDe } from "../autenticacao/plugin.js";
import type { Dependencias } from "../dependencias.js";
import { ErroApi, naoEncontrado } from "../erros.js";
import { montarResposta } from "../integracoes/assistente.js";
import { extrairSugestao, pedidoDeSugestao } from "../integracoes/sugestao-eventos.js";
import { exigirUuid, ParamId } from "./comum.js";

const DIA_MS = 86_400_000;
/** A sugestão cobre hoje e os 7 dias seguintes. */
const DIAS_DA_SUGESTAO = 7;
const LIMITE_SUGESTOES = { max: 10, timeWindow: "1 minute" } as const;
const TEMPO_SUGESTAO_MS = 120_000;

const RespostaSugestao = z.object({
  criados: z.array(EventoMercadoEsquema),
  descartados: z.number().int().nonnegative(),
  jaExistiam: z.number().int().nonnegative(),
});

/**
 * Agenda de eventos de mercado (`/eventos-mercado`). O filtro de dia perigoso dos robôs
 * e dos backtests lê esta agenda; cada pessoa só enxerga a sua (RLS). Escrever pede
 * token com escopo `operar` (ou a sessão da tela); `sugerir` pede ao Claude os eventos
 * dos próximos 7 dias e grava como `sugerido`, para a pessoa confirmar ou remover.
 */
export const rotasEventosMercado: FastifyPluginAsyncZod<{ deps: Dependencias }> = async (app, { deps }) => {
  const { eventosMercado } = deps.banco;

  app.get(
    "/eventos-mercado",
    {
      config: { acesso: "leitura" },
      schema: { querystring: ConsultaAgendaEsquema, response: { 200: z.array(EventoMercadoEsquema) } },
    },
    async (req) => eventosMercado.listar(usuarioIdDe(req), req.query.de, req.query.ate),
  );

  app.post(
    "/eventos-mercado",
    {
      config: { acesso: "operar" },
      schema: { body: NovoEventoMercadoEsquema, response: { 201: EventoMercadoEsquema } },
    },
    async (req, reply) => reply.code(201).send(await eventosMercado.criar(usuarioIdDe(req), req.body)),
  );

  app.post(
    "/eventos-mercado/:id/confirmar",
    { config: { acesso: "operar" }, schema: { params: ParamId, response: { 200: EventoMercadoEsquema } } },
    async (req) => {
      const confirmado = await eventosMercado.confirmar(
        usuarioIdDe(req),
        exigirUuid(req.params.id, "evento"),
      );
      if (!confirmado) throw naoEncontrado("evento");
      return confirmado;
    },
  );

  app.delete(
    "/eventos-mercado/:id",
    { config: { acesso: "operar" }, schema: { params: ParamId } },
    async (req, reply) => {
      if (!(await eventosMercado.remover(usuarioIdDe(req), exigirUuid(req.params.id, "evento"))))
        throw naoEncontrado("evento");
      return reply.code(204).send();
    },
  );

  app.post(
    "/eventos-mercado/sugerir",
    {
      config: { acesso: "operar", rateLimit: LIMITE_SUGESTOES },
      schema: { response: { 200: RespostaSugestao } },
    },
    async (req) => {
      if (!deps.assistente)
        throw new ErroApi(
          503,
          "assistente_indisponivel",
          "o Claude está desligado: configure AGENTE_URL e AGENTE_SEGREDO na API para pedir sugestões",
        );
      const usuarioId = usuarioIdDe(req);
      const hoje = diaNoFuso(deps.agora(), deps.config.ZENTRADE_FUSO);
      const periodo = {
        de: hoje,
        ate: diaNoFuso(deps.agora() + DIAS_DA_SUGESTAO * DIA_MS, deps.config.ZENTRADE_FUSO),
      };
      const texto = await pedirAoClaude(deps, usuarioId, pedidoDeSugestao(periodo.de, periodo.ate));
      const sugestao = extrairSugestao(texto, periodo);
      if (sugestao.eventos.length === 0 && sugestao.descartados > 0)
        throw new ErroApi(
          502,
          "sugestao_invalida",
          "o Claude respondeu, mas nada que dê para usar (datas ou campos inválidos); nada foi gravado. Tente de novo ou cadastre à mão",
        );
      const criados: EventoMercadoDTO[] = await eventosMercado.criarSugeridos(usuarioId, sugestao.eventos);
      return {
        criados,
        descartados: sugestao.descartados,
        jaExistiam: sugestao.eventos.length - criados.length,
      };
    },
  );
};

/** Pergunta ao assistente (o provedor que a pessoa configurou) e junta o texto da resposta. */
async function pedirAoClaude(deps: Dependencias, usuarioId: string, pergunta: string): Promise<string> {
  const montada = montarResposta();
  const prazo = AbortSignal.timeout(TEMPO_SUGESTAO_MS);
  try {
    for await (const e of deps.assistente!.responder({ usuarioId, historico: [], pergunta }, prazo))
      montada.aplicar(e);
  } catch {
    throw new ErroApi(
      502,
      "agente_indisponivel",
      "não consegui falar com o Claude agora; tente de novo daqui a pouco",
    );
  }
  const r = montada.resultado();
  if (r.situacao !== "ok")
    throw new ErroApi(502, "agente_falhou", r.erro ?? "o Claude não terminou a resposta; tente de novo");
  return r.texto;
}
