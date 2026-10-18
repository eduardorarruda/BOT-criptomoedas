import {
  AvisoEsquema,
  DivergenciaEsquema,
  LimitesContaEsquema,
  ResultadoReconciliacaoEsquema,
  SituacaoContaEsquema,
  type DivergenciaDTO,
} from "@zentrade/contratos";
import type { DivergenciaGravada } from "@zentrade/banco";
import { dec } from "@zentrade/dominio";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { autorDe, exigirReautenticacao, usuarioIdDe } from "../autenticacao/plugin.js";
import type { Dependencias } from "../dependencias.js";
import { ErroApi, naoEncontrado } from "../erros.js";
import { erroDaBinance, fabricaContaBinance } from "../integracoes/binance-conta.js";
import { ativoBase, criarReconciliador, type Reconciliador } from "../integracoes/reconciliacao.js";
import type { Log } from "../integracoes/tipos.js";
import { exigirUuid, ParamId } from "./comum.js";
import { afrouxa, ajustesDaFalta, situacaoDaConta } from "./risco-servico.js";

const LIMITE_RECONCILIAR = { max: 6, timeWindow: "1 minute" } as const;

const reconciliadores = new WeakMap<object, Reconciliador>();

/** O reconciliador das dependências ou, sem ele, o padrão (Binance de verdade pelo fetch global). */
export function reconciliadorDe(deps: Dependencias, log: Log): Reconciliador {
  if (deps.reconciliador) return deps.reconciliador;
  const existente = reconciliadores.get(deps);
  if (existente) return existente;
  const novo = criarReconciliador({
    banco: deps.banco,
    credenciais: deps.banco.credenciais,
    criarConta: deps.criarContaBinance ?? fabricaContaBinance(),
    ...(deps.alertas ? { alertas: deps.alertas } : {}),
    agora: deps.agora,
    log,
  });
  reconciliadores.set(deps, novo);
  return novo;
}

/** Os robôs da rede que operam o ativo da divergência (para a tela dizer quem está parado). */
async function comRobos(
  deps: Dependencias,
  usuarioId: string,
  d: DivergenciaGravada,
): Promise<DivergenciaDTO> {
  const robos = await deps.banco.riscoConta.robosDaRede(usuarioId, d.rede);
  return {
    ...d,
    robos: robos.filter((r) => ativoBase(r.simbolo) === d.ativo).map(({ id, nome }) => ({ id, nome })),
  };
}

/**
 * Limites da conta, pausas, divergências com a corretora e avisos (`/risco/...`,
 * `/avisos`). Apertar limite não tem atrito; afrouxar, liberar pausa e aceitar o saldo
 * da corretora pedem reautenticação (como desligar a parada total).
 */
export const rotasRisco: FastifyPluginAsyncZod<{ deps: Dependencias }> = async (app, { deps }) => {
  const { banco } = deps;
  const minutos = deps.config.RECONCILIACAO_MIN;
  if (minutos > 0) {
    const parar = reconciliadorDe(deps, app.log).agendar(minutos * 60_000);
    app.addHook("onClose", async () => parar());
  }

  app.get(
    "/risco/limites-conta",
    { config: { acesso: "leitura" }, schema: { response: { 200: LimitesContaEsquema } } },
    async (req) => (await banco.limitesConta.obter(usuarioIdDe(req))).limites,
  );

  app.put(
    "/risco/limites-conta",
    {
      config: { acesso: "sessao" },
      schema: { body: LimitesContaEsquema, response: { 200: LimitesContaEsquema } },
    },
    async (req) => {
      const usuarioId = usuarioIdDe(req);
      const { limites } = await banco.limitesConta.obter(usuarioId);
      if (afrouxa(limites, req.body)) exigirReautenticacao(req, deps.agora());
      return (await banco.limitesConta.definir(usuarioId, req.body)).limites;
    },
  );

  app.get(
    "/risco/conta",
    { config: { acesso: "leitura" }, schema: { response: { 200: SituacaoContaEsquema } } },
    async (req) => {
      const usuarioId = usuarioIdDe(req);
      const agora = deps.agora();
      const [dados, divergencias] = await Promise.all([
        banco.riscoConta.situacao(usuarioId, agora),
        banco.divergencias.listar(usuarioId, agora),
      ]);
      return situacaoDaConta(dados, divergencias, agora, deps.config.ZENTRADE_FUSO);
    },
  );

  // Liberar as pausas de queda e de sequência de stops: zera o pico e a contagem.
  app.post(
    "/risco/liberar",
    { config: { acesso: "sessao", critica: true }, schema: { response: { 200: LimitesContaEsquema } } },
    async (req) => (await banco.limitesConta.liberar(usuarioIdDe(req), deps.agora())).limites,
  );

  app.get(
    "/risco/divergencias",
    { config: { acesso: "leitura" }, schema: { response: { 200: z.array(DivergenciaEsquema) } } },
    async (req) => {
      const usuarioId = usuarioIdDe(req);
      const lista = await banco.divergencias.listar(usuarioId, deps.agora());
      return Promise.all(lista.map((d) => comRobos(deps, usuarioId, d)));
    },
  );

  app.post(
    "/risco/reconciliar",
    {
      config: { acesso: "operar", rateLimit: LIMITE_RECONCILIAR },
      schema: { response: { 200: ResultadoReconciliacaoEsquema } },
    },
    async (req) => reconciliadorDe(deps, req.log).conferirPessoa(usuarioIdDe(req)),
  );

  // Aceitar o saldo da corretora: confere de novo e só então baixa a falta das posições.
  app.post(
    "/risco/divergencias/:id/aceitar",
    {
      config: { acesso: "sessao", critica: true },
      schema: { params: ParamId, response: { 200: DivergenciaEsquema } },
    },
    async (req) => {
      const usuarioId = usuarioIdDe(req);
      const id = exigirUuid(req.params.id, "divergência");
      const antes = await banco.divergencias.obter(usuarioId, id);
      if (!antes) throw naoEncontrado("divergência");
      const conferida = await reconciliadorDe(deps, req.log)
        .conferir(usuarioId, antes.rede)
        .catch((e: unknown) => {
          throw erroDaBinance(e);
        });
      if (!conferida.ok)
        throw new ErroApi(502, "binance_indisponivel", conferida.erro ?? "a Binance não respondeu");
      const atual = await banco.divergencias.obter(usuarioId, id);
      if (atual?.estado !== "aberta")
        throw new ErroApi(
          409,
          "divergencia_resolvida",
          "a conferência de agora já não acha a falta: a divergência foi resolvida e não há o que aceitar",
        );
      const robos = (await banco.riscoConta.posicoes(usuarioId, atual.rede, deps.agora())).filter(
        (r) => ativoBase(r.simbolo) === atual.ativo,
      );
      const aceita = await banco.divergencias.aceitar(usuarioId, id, {
        porQuem: autorDe(req),
        agora: deps.agora(),
        ajustes: ajustesDaFalta(dec(atual.falta), robos),
      });
      return comRobos(deps, usuarioId, aceita);
    },
  );

  app.get(
    "/avisos",
    {
      config: { acesso: "leitura" },
      schema: {
        querystring: z.object({ limite: z.coerce.number().int().min(1).max(100).optional() }),
        response: { 200: z.array(AvisoEsquema) },
      },
    },
    async (req) => banco.avisos.listar(usuarioIdDe(req), req.query.limite),
  );

  app.post(
    "/avisos/lidos",
    { config: { acesso: "sessao" }, schema: { response: { 200: z.object({ lidos: z.number().int() }) } } },
    async (req) => ({ lidos: await banco.avisos.marcarLidos(usuarioIdDe(req), deps.agora()) }),
  );
};
