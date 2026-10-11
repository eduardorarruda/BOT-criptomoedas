import { criarBanco, type Banco } from "@zentrade/banco";
import type { FastifyBaseLogger } from "fastify";
import type { Redis } from "ioredis";
import { construirApp } from "./app.js";
import { lerConfig, semVazias, type Config } from "./config.js";
import type { Dependencias } from "./dependencias.js";
import { antiReplayRedis } from "./integracoes/anti-replay.js";
import { armazemRedis, criarRegistroAutomacoes } from "./integracoes/automacoes.js";
import { criarServicoConhecimento, prepararEmbeddings, repositorioRag } from "./integracoes/conhecimento.js";
import { criarHubEventos } from "./integracoes/eventos.js";
import { criarClienteCotacoesB3 } from "./integracoes/cotacoes-b3.js";
import { criarFilaBacktests } from "./integracoes/fila.js";
import { criarClienteN8n, n8nComRegistro } from "./integracoes/n8n.js";
import { assinarEventos, conectarRedis, verificadorSaude } from "./integracoes/redis.js";
import { criarRetransmissorN8n } from "./integracoes/retransmissor.js";
import { criarLog } from "./log.js";

const HORA_MS = 3_600_000;

function conhecimentoDe(banco: Banco, log: FastifyBaseLogger) {
  const embeddings = prepararEmbeddings(semVazias(process.env));
  if ("indisponivel" in embeddings) log.warn({ motivo: embeddings.indisponivel }, "RAG desligado na API");
  return criarServicoConhecimento({
    repositorio: repositorioRag(banco),
    documentos: banco.conhecimento,
    embeddings,
  });
}

/** Monta as dependências reais: banco, Redis (eventos, fila, anti-replay, automações) e n8n. */
async function montarDependencias(config: Config, log: FastifyBaseLogger, redis: Redis, assinante: Redis) {
  const agora = Date.now;
  const banco = criarBanco({
    url: config.DATABASE_URL,
    chaveMestra: config.ZENTRADE_CHAVE_MESTRA,
    validadeAprovacaoMs: config.APROVACAO_VALIDADE_MIN * 60_000,
    aoAviso: (m) => log.debug({ aviso: m }, "aviso do PostgreSQL"),
  });
  const fila = criarFilaBacktests(redis);
  const automacoes = criarRegistroAutomacoes({ armazem: armazemRedis(redis), agora, log });
  const n8n = n8nComRegistro(
    criarClienteN8n({ url: config.N8N_URL, segredo: config.N8N_WEBHOOK_SEGREDO }),
    automacoes,
  );
  const hub = criarHubEventos({ donos: banco.sistema, log });
  hub.aoEvento(criarRetransmissorN8n({ decisoes: banco.decisoes, n8n, log }));
  await assinarEventos(assinante, hub);
  const saude = verificadorSaude({
    redis,
    log,
    agora,
    ...(config.AGENTE_URL ? { agenteUrl: config.AGENTE_URL } : {}),
  });
  const deps: Dependencias = {
    config,
    banco,
    fila,
    n8n,
    conhecimento: conhecimentoDe(banco, log),
    automacoes,
    antiReplay: antiReplayRedis(redis),
    hub,
    saude,
    agora,
    cotacoesB3: criarClienteCotacoesB3({ token: config.BRAPI_TOKEN }),
  };
  return { deps, fila };
}

async function iniciar(config: Config): Promise<void> {
  const log = criarLog(config.LOG_LEVEL);
  const redis = conectarRedis(config.REDIS_URL, "zentrade-api");
  const assinante = conectarRedis(config.REDIS_URL, "zentrade-api-eventos");
  for (const r of [redis, assinante])
    r.on("error", (erro: Error) => log.error({ err: erro }, "erro na conexão com o Redis"));
  const { deps, fila } = await montarDependencias(config, log, redis, assinante);
  const app = await construirApp(deps, log);
  if (!config.COOKIE_SEGURO)
    log.warn("COOKIE_SEGURO=false: cookies sem Secure. Use só em desenvolvimento local.");

  const limpeza = setInterval(() => {
    deps.banco.sessoes
      .removerExpiradas(Date.now())
      .catch((erro: unknown) => log.error({ err: erro }, "falha ao limpar sessões"));
  }, HORA_MS);
  limpeza.unref();

  const encerrar = async (sinal: string) => {
    log.info({ sinal }, "encerrando a API");
    clearInterval(limpeza);
    await app.close();
    await fila.fechar();
    await Promise.allSettled([assinante.quit(), redis.quit(), deps.banco.fechar()]);
  };
  process.once("SIGTERM", (s) => void encerrar(s));
  process.once("SIGINT", (s) => void encerrar(s));

  await app.listen({ host: config.API_HOST, port: config.API_PORTA });
}

try {
  await iniciar(lerConfig(process.env));
} catch (erro) {
  process.stderr.write(`Não foi possível iniciar a API: ${(erro as Error).message}\n`);
  process.exitCode = 1;
}
