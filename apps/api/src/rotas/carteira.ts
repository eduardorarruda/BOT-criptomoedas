import {
  CarteiraAtivoEsquema,
  CarteiraEsquema,
  PedidoSincronizacaoEsquema,
  RedeContaEsquema,
  SincronizacaoEsquema,
} from "@zentrade/contratos";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { usuarioIdDe } from "../autenticacao/plugin.js";
import type { Dependencias } from "../dependencias.js";
import { servicoCarteiraDe, type ServicoCarteira } from "../integracoes/binance-carteira.js";

const ConsultaRede = z.object({ rede: RedeContaEsquema.optional() });
const ParamAtivo = z.object({
  ativo: z.string().regex(/^[A-Z0-9]{1,20}$/, "moeda em maiúsculas, ex.: BTC"),
});
/** Sincronizar custa peso na Binance (por IP): poucas vezes por minuto bastam. */
const LIMITE_SINCRONIZAR = { max: 6, timeWindow: "1 minute" } as const;
const MINUTO_MS = 60_000;

/** Sincronização periódica de todas as pessoas, uma rodada por vez; para quando a API fecha. */
function agendarSincronizacao(
  servico: ServicoCarteira,
  minutos: number,
  aoFalhar: (erro: unknown) => void,
): () => void {
  if (minutos <= 0) return () => undefined;
  let rodando = false;
  const timer = setInterval(() => {
    if (rodando) return;
    rodando = true;
    servico
      .sincronizarTodos()
      .catch(aoFalhar)
      .finally(() => (rodando = false));
  }, minutos * MINUTO_MS);
  timer.unref();
  return () => clearInterval(timer);
}

/**
 * Carteira da Binance de cada pessoa (docs/carteira.md): resumo e moedas calculados na
 * hora a partir do que foi sincronizado, detalhe por moeda e sincronização sob demanda.
 */
export const rotasCarteira: FastifyPluginAsyncZod<{ deps: Dependencias }> = async (app, { deps }) => {
  const servico = servicoCarteiraDe(deps, app.log);
  const parar = agendarSincronizacao(servico, deps.config.CARTEIRA_SINCRONIZAR_MIN, (erro) =>
    app.log.error({ err: erro }, "falha na sincronização periódica da carteira"),
  );
  app.addHook("onClose", async () => parar());

  app.get(
    "/carteira",
    {
      config: { acesso: "leitura" },
      schema: { querystring: ConsultaRede, response: { 200: CarteiraEsquema } },
    },
    async (req) => servico.carteira(usuarioIdDe(req), req.query.rede),
  );

  app.get(
    "/carteira/:ativo",
    {
      config: { acesso: "leitura" },
      schema: { params: ParamAtivo, querystring: ConsultaRede, response: { 200: CarteiraAtivoEsquema } },
    },
    async (req) => servico.ativo(usuarioIdDe(req), req.params.ativo, req.query.rede),
  );

  // Só lê a Binance e grava no banco da pessoa: não opera, então o escopo leitura basta.
  app.post(
    "/carteira/sincronizar",
    {
      config: { acesso: "leitura", rateLimit: LIMITE_SINCRONIZAR },
      schema: { body: PedidoSincronizacaoEsquema.nullish(), response: { 200: SincronizacaoEsquema } },
    },
    async (req) => servico.sincronizar(usuarioIdDe(req), req.body ?? {}),
  );
};
