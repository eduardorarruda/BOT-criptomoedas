import {
  CandleApiEsquema,
  Intervalo,
  MS_POR_INTERVALO,
  PontoPatrimonioEsquema,
  ResumoEsquema,
} from "@zentrade/contratos";
import { LIMITE_MAXIMO_LISTA } from "@zentrade/banco";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { usuarioIdDe } from "../autenticacao/plugin.js";
import type { Dependencias } from "../dependencias.js";
import { ErroApi } from "../erros.js";

const Simbolo = z.object({ simbolo: z.string().regex(/^[A-Z0-9]{5,20}$/, "símbolo como BTCUSDT") });
const Periodo = z.object({
  intervalo: Intervalo,
  inicio: z.coerce.number().int().nonnegative().optional(),
  fim: z.coerce.number().int().nonnegative().optional(),
});
const Dias = z.object({ dias: z.coerce.number().int().min(1).max(365).optional() });

export const rotasMercado: FastifyPluginAsyncZod<{ deps: Dependencias }> = async (app, { deps }) => {
  app.get(
    "/mercado/:simbolo/candles",
    {
      config: { acesso: "leitura" },
      schema: { params: Simbolo, querystring: Periodo, response: { 200: z.array(CandleApiEsquema) } },
    },
    async (req) => {
      const { intervalo } = req.query;
      const fim = req.query.fim ?? deps.agora();
      // Sem início, devolve os últimos LIMITE_MAXIMO_LISTA candles do intervalo.
      const inicio = req.query.inicio ?? fim - LIMITE_MAXIMO_LISTA * MS_POR_INTERVALO[intervalo];
      if (fim <= inicio) throw new ErroApi(400, "periodo_invalido", "o fim precisa ser depois do início");
      return deps.banco.mercado.candles({ simbolo: req.params.simbolo, intervalo, inicio, fim });
    },
  );

  app.get(
    "/resumo",
    { config: { acesso: "leitura" }, schema: { response: { 200: ResumoEsquema } } },
    async (req) => deps.banco.resumo.resumo(usuarioIdDe(req), deps.agora()),
  );

  // Curva real: resultado realizado acumulado por dia, das execuções confirmadas.
  app.get(
    "/patrimonio",
    {
      config: { acesso: "leitura" },
      schema: { querystring: Dias, response: { 200: z.array(PontoPatrimonioEsquema) } },
    },
    async (req) => deps.banco.resumo.patrimonio(usuarioIdDe(req), deps.agora(), req.query.dias ?? 30),
  );
};
