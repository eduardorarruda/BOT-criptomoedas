import { criarBanco } from "@zentrade/banco";
import { construirApp } from "./app.js";
import { lerConfig, type Config } from "./config.js";
import { criarEmbeddings } from "./integracoes/embeddings.js";
import { criarHubEventos } from "./integracoes/eventos.js";
import { criarFilaBacktests } from "./integracoes/fila.js";
import { criarClienteN8n } from "./integracoes/n8n.js";
import { assinarEventos, conectarRedis, verificadorSaude } from "./integracoes/redis.js";
import { criarRetransmissorN8n } from "./integracoes/retransmissor.js";
import { criarLog } from "./log.js";

const HORA_MS = 3_600_000;

async function iniciar(config: Config): Promise<void> {
  const log = criarLog(config.LOG_NIVEL);
  const banco = criarBanco({
    url: config.DATABASE_URL,
    chaveMestra: config.ZENTRADE_CHAVE_MESTRA,
    validadeAprovacaoMs: config.APROVACAO_VALIDADE_MIN * 60_000,
    aoAviso: (m) => log.debug({ aviso: m }, "aviso do PostgreSQL"),
  });
  const redis = conectarRedis(config.REDIS_URL, "zentrade-api");
  const assinante = conectarRedis(config.REDIS_URL, "zentrade-api-eventos");
  for (const r of [redis, assinante])
    r.on("error", (erro: Error) => log.error({ err: erro }, "erro na conexão com o Redis"));
  const fila = criarFilaBacktests(redis);
  const n8n = criarClienteN8n({ url: config.N8N_URL, segredo: config.N8N_WEBHOOK_SEGREDO });
  const hub = criarHubEventos({ donos: banco.sistema, log });
  hub.aoEvento(criarRetransmissorN8n({ decisoes: banco.decisoes, n8n, log }));
  await assinarEventos(assinante, hub);

  const agora = Date.now;
  const saude = verificadorSaude({
    redis,
    log,
    agora,
    ...(config.AGENTE_URL ? { agenteUrl: config.AGENTE_URL } : {}),
  });
  const embeddings = config.embeddings ? criarEmbeddings(config.embeddings) : null;
  const app = await construirApp({ config, banco, fila, n8n, embeddings, hub, saude, agora }, log);
  if (!config.COOKIE_SEGURO)
    log.warn("COOKIE_SEGURO=false: cookies sem Secure. Use só em desenvolvimento local.");

  const limpeza = setInterval(() => {
    banco.sessoes
      .removerExpiradas(Date.now())
      .catch((erro: unknown) => log.error({ err: erro }, "falha ao limpar sessões"));
  }, HORA_MS);
  limpeza.unref();

  const encerrar = async (sinal: string) => {
    log.info({ sinal }, "encerrando a API");
    clearInterval(limpeza);
    await app.close();
    await fila.fechar();
    await Promise.allSettled([assinante.quit(), redis.quit(), banco.fechar()]);
  };
  process.once("SIGTERM", (s) => void encerrar(s));
  process.once("SIGINT", (s) => void encerrar(s));

  await app.listen({ host: config.API_HOST, port: config.API_PORTA });
}

try {
  await iniciar(lerConfig(process.env));
} catch (erro) {
  console.error((erro as Error).message);
  process.exitCode = 1;
}
