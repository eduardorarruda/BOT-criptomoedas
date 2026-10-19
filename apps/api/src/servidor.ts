import { criarBanco, type Banco } from "@zentrade/banco";
import type { FastifyBaseLogger } from "fastify";
import type { Redis } from "ioredis";
import { construirApp } from "./app.js";
import { lerConfig, semVazias, type Config } from "./config.js";
import type { Dependencias } from "./dependencias.js";
import { criarCentralAlertas } from "./integracoes/alertas.js";
import { criarTradutorAlertas } from "./integracoes/alertas-eventos.js";
import { antiReplayRedis, PREFIXO_ALERTA_ENVIADO } from "./integracoes/anti-replay.js";
import { armazemRedis, criarRegistroAutomacoes } from "./integracoes/automacoes.js";
import { configAssistenteDoAmbiente, criarClienteAssistente } from "./integracoes/assistente.js";
import { criarServicoConhecimento, prepararEmbeddings, repositorioRag } from "./integracoes/conhecimento.js";
import { criarServicoArquivos } from "./integracoes/conhecimento-arquivos.js";
import { criarHubEventos } from "./integracoes/eventos.js";
import { criarClienteCotacoesB3 } from "./integracoes/cotacoes-b3.js";
import { criarFilaBacktests } from "./integracoes/fila.js";
import { criarTestadorMt5 } from "./integracoes/coletor-mt5.js";
import { criarFilaAtualizacoesMt5, criarFilaImportacoesB3 } from "./integracoes/fila-importacoes-b3.js";
import { criarClienteN8n, n8nComRegistro } from "./integracoes/n8n.js";
import { criarAtualizadorIndicadores } from "./integracoes/bcb-atualizador.js";
import { criarClienteBcb } from "./integracoes/bcb.js";
import { lerConfigPluggy } from "./integracoes/pluggy-config.js";
import { criarSincronizadorPluggy } from "./integracoes/pluggy-sincronizador.js";
import { criarClientePluggy } from "./integracoes/pluggy.js";
import { assinarEventos, conectarRedis, verificadorSaude } from "./integracoes/redis.js";
import { criarRetransmissorN8n } from "./integracoes/retransmissor.js";
import { criarLog } from "./log.js";
import { hojeEm, type ServicosRendaFixa } from "./rotas/renda-fixa-servico.js";

const HORA_MS = 3_600_000;

function conhecimentoDe(banco: Banco, log: FastifyBaseLogger, agora: () => number) {
  const embeddings = prepararEmbeddings(semVazias(process.env));
  if ("indisponivel" in embeddings) log.warn({ motivo: embeddings.indisponivel }, "RAG desligado na API");
  const repositorio = repositorioRag(banco);
  const conhecimento = criarServicoConhecimento({ repositorio, documentos: banco.conhecimento, embeddings });
  const arquivos = criarServicoArquivos({ conhecimento, banco, repositorio, embeddings, agora });
  return { conhecimento, arquivos };
}

/** O assistente (chat) no agente: sem AGENTE_URL e AGENTE_SEGREDO, fica desligado. */
function assistenteDe(log: FastifyBaseLogger) {
  const config = configAssistenteDoAmbiente(semVazias(process.env));
  if (!config) log.warn("AGENTE_URL ou AGENTE_SEGREDO ausentes: o assistente fica desligado");
  return config ? criarClienteAssistente(config) : null;
}

/** Índices do Banco Central (cache diário no banco) e Pluggy (só com as credenciais da instalação). */
function rendaFixaDe(banco: Banco, log: FastifyBaseLogger, agora: () => number): ServicosRendaFixa {
  const config = lerConfigPluggy(process.env);
  if (!config)
    log.info("Pluggy desligada: defina PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET para conectar bancos");
  return {
    indicadores: criarAtualizadorIndicadores({
      cliente: criarClienteBcb(),
      armazem: banco.indicadores,
      agora,
      log,
    }),
    pluggy: criarSincronizadorPluggy({
      cliente: config ? criarClientePluggy({ config }) : null,
      armazem: banco.pluggy,
      agora,
      hoje: () => hojeEm(agora()),
      log,
    }),
  };
}

/** Monta as dependências reais: banco, Redis (eventos, fila, anti-replay, automações) e n8n. */
async function montarDependencias(config: Config, log: FastifyBaseLogger, redis: Redis, assinante: Redis) {
  const agora = Date.now;
  const banco = criarBanco({
    url: config.DATABASE_URL,
    chaveMestra: config.ZENTRADE_CHAVE_MESTRA,
    validadeAprovacaoMs: config.APROVACAO_VALIDADE_MIN * 60_000,
    aoAviso: (m) => log.debug({ aviso: m }, "aviso do PostgreSQL"),
    fuso: config.ZENTRADE_FUSO,
  });
  const fila = criarFilaBacktests(redis);
  const filaImportacoesB3 = criarFilaImportacoesB3(redis);
  const filaAtualizacoesMt5 = criarFilaAtualizacoesMt5(redis);
  const automacoes = criarRegistroAutomacoes({ armazem: armazemRedis(redis), agora, log });
  const n8n = n8nComRegistro(
    criarClienteN8n({ url: config.N8N_URL, segredo: config.N8N_WEBHOOK_SEGREDO }),
    automacoes,
  );
  const hub = criarHubEventos({ donos: banco.sistema, log });
  hub.aoEvento(criarRetransmissorN8n({ decisoes: banco.decisoes, n8n, log }));
  // Alertas: stop, perda do dia, pausas, ordens, robô que não liga, WebSocket, orçamento de IA.
  const alertas = criarCentralAlertas({
    avisos: banco.avisos,
    n8n,
    dedup: antiReplayRedis(redis, PREFIXO_ALERTA_ENVIADO),
    donoDoRobo: (id) => banco.sistema.donoDoRobo(id),
    log,
    agora,
  });
  hub.aoEvento(
    criarTradutorAlertas({ central: alertas, consultas: banco.sistema, log, fuso: config.ZENTRADE_FUSO }),
  );
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
    filaImportacoesB3,
    diretorioImportacoesB3: config.ZENTRADE_IMPORTACOES_B3_DIR,
    filaAtualizacoesMt5,
    ...(config.COLETOR_MT5_URL ? { testarMt5: criarTestadorMt5(config.COLETOR_MT5_URL) } : {}),
    n8n,
    ...conhecimentoDe(banco, log, agora),
    assistente: assistenteDe(log),
    automacoes,
    antiReplay: antiReplayRedis(redis),
    hub,
    saude,
    agora,
    rendaFixa: rendaFixaDe(banco, log, agora),
    cotacoesB3: criarClienteCotacoesB3({ token: config.BRAPI_TOKEN }),
    alertas,
  };
  return { deps, fila, filaImportacoesB3, filaAtualizacoesMt5 };
}

async function iniciar(config: Config): Promise<void> {
  const log = criarLog(config.LOG_LEVEL);
  const redis = conectarRedis(config.REDIS_URL, "zentrade-api");
  const assinante = conectarRedis(config.REDIS_URL, "zentrade-api-eventos");
  for (const r of [redis, assinante])
    r.on("error", (erro: Error) => log.error({ err: erro }, "erro na conexão com o Redis"));
  const { deps, fila, filaImportacoesB3, filaAtualizacoesMt5 } = await montarDependencias(
    config,
    log,
    redis,
    assinante,
  );
  const app = await construirApp(deps, log);
  if (!config.COOKIE_SEGURO)
    log.warn("COOKIE_SEGURO=false: cookies sem Secure. Use só em desenvolvimento local.");

  const limpeza = setInterval(() => {
    deps.banco.sessoes
      .removerExpiradas(Date.now())
      .catch((erro: unknown) => log.error({ err: erro }, "falha ao limpar sessões"));
  }, HORA_MS);
  limpeza.unref();
  const pararIndicadores = deps.rendaFixa?.indicadores.agendar();
  const pararPluggy = deps.rendaFixa?.pluggy.agendar();

  const encerrar = async (sinal: string) => {
    log.info({ sinal }, "encerrando a API");
    clearInterval(limpeza);
    pararIndicadores?.();
    pararPluggy?.();
    await app.close();
    await fila.fechar();
    await filaImportacoesB3.fechar();
    await filaAtualizacoesMt5.fechar();
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
