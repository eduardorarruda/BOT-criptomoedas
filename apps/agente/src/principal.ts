import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { criarBancoDoAgente, type BancoDoAgente } from "@zentrade/banco";
import { criarBuscaHibrida, criarRepositorioPostgres, embeddingsDoAmbiente } from "@zentrade/conhecimento";
import { ocultarTokensClaude, type EstadoAgenteAssistente } from "@zentrade/contratos";
import { Redis } from "ioredis";
import pino, { type Logger } from "pino";
import postgres from "postgres";
import { Analista } from "./analista.js";
import { ChatApi } from "./assistente/chat-api.js";
import { ChatCli } from "./assistente/chat-cli.js";
import { registrarRotasAssistente } from "./assistente/rotas.js";
import { ServicoChat } from "./assistente/servico-chat.js";
import { AnalistaCli } from "./claude-cli/analista-cli.js";
import { descreverContas } from "./claude-cli/contas.js";
import { ExecutorClaude, type FonteTokensClaude } from "./claude-cli/executor.js";
import { resolverClaude, resolverNoPath } from "./claude-cli/resolver.js";
import { ConexoesClaude } from "./claude-cli/token/conexoes.js";
import { registrarRotasTokenClaude } from "./claude-cli/token/rotas.js";
import { criarTesteToken } from "./claude-cli/token/testar.js";
import { configDoAgente, semVazias, type ConfigAgente } from "./config.js";
import { alertasRedis, publicadorNulo, publicadorRedis } from "./eventos/publicador.js";
import { AnalistaComOrcamento, PortaoOrcamento } from "./orcamento.js";
import { registrarRotasPonte } from "./ponte/rotas.js";
import { SessoesPonte } from "./ponte/sessoes.js";
import { criarHistoricoPostgres } from "./postgres/historico.js";
import { AnalistaPorPessoa, configComPadrao } from "./provedores/analista-por-pessoa.js";
import { MODELOS_SUGERIDOS } from "./provedores/modelos.js";
import { criarServidor } from "./servidor.js";

/** O Claude Code, se estiver instalado: executor com a ponte MCP deste agente. */
function prepararCli(
  config: ConfigAgente,
  sessoes: SessoesPonte,
  tokens: FonteTokensClaude | null,
  log: Logger,
): ExecutorClaude | null {
  const caminho = resolverClaude(config.cli.caminho, process.env["PATH"]);
  if (!caminho) {
    log.warn(
      { caminho: config.cli.caminho },
      "Claude Code não encontrado: o provedor 'cli' fica indisponível",
    );
    return null;
  }
  return new ExecutorClaude(
    {
      caminho,
      contas: config.cli.contas,
      urlAgente: `http://127.0.0.1:${config.porta}`,
      caminhoPonte: fileURLToPath(new URL("./ponte/bin.js", import.meta.url)),
      maxTurnos: config.cli.maxTurnos,
      tetoUsd: config.cli.tetoUsd,
      env: process.env,
      ...(tokens ? { tokens } : {}),
    },
    sessoes,
  );
}

/**
 * O Claude de cada pessoa: com o CLI e a chave mestra, o agente usa o token que ela
 * conectou; com o `script` (util-linux) também, conecta pelo botão da tela.
 */
function prepararTokenClaude(
  config: ConfigAgente,
  executor: ExecutorClaude | null,
  credenciais: BancoDoAgente["credenciaisClaude"],
  log: Logger,
) {
  if (!executor || !credenciais) {
    if (executor) log.info("ZENTRADE_CHAVE_MESTRA ausente no agente: o Claude de cada pessoa fica desligado");
    return { conexoes: null, testar: null, capacidade: { usar: false, conectar: false } };
  }
  const testar = criarTesteToken({ executor, registrar: credenciais.registrarTeste });
  const script = resolverNoPath("script", process.env["PATH"]);
  const claude = resolverClaude(config.cli.caminho, process.env["PATH"]);
  if (!script || !claude) {
    log.warn("utilitário script (util-linux) não encontrado: conectar o Claude pelo botão fica desligado");
    return { conexoes: null, testar, capacidade: { usar: true, conectar: false } };
  }
  const conexoes = new ConexoesClaude({
    claude,
    script,
    env: process.env,
    salvar: (usuarioId, token) => credenciais.salvar(usuarioId, token, "conexao"),
  });
  return { conexoes, testar, capacidade: { usar: true, conectar: true } };
}

function prepararRedis(config: ConfigAgente, log: Logger) {
  if (!config.urlRedis) {
    log.warn("REDIS_URL não definida: os passos ao vivo das análises e os alertas não serão publicados");
    return { redis: null, publicador: publicadorNulo, alertar: undefined };
  }
  const redis = new Redis(config.urlRedis, { connectionName: "zentrade-agente", maxRetriesPerRequest: 2 });
  redis.on("error", (erro: Error) => log.warn({ err: erro }, "erro na conexão com o Redis"));
  return { redis, publicador: publicadorRedis(redis, log), alertar: alertasRedis(redis, log) };
}

/** Banco, RAG, Redis, Claude Code e API da Anthropic, montados a partir do ambiente validado. */
function montarServicos(config: ConfigAgente, logger: Logger) {
  // Sem onnotice o postgres.js jogaria no console os avisos do full-text (consulta só de stopwords).
  const sql = postgres(config.urlBanco, { max: 5, onnotice: () => undefined });
  const banco = criarBancoDoAgente({
    url: config.urlBanco,
    maximoConexoes: 5,
    fuso: config.fuso,
    ...(config.chaveMestra ? { chaveMestra: config.chaveMestra } : {}),
  });
  const busca = criarBuscaHibrida({
    repositorio: criarRepositorioPostgres(sql),
    embeddings: embeddingsDoAmbiente(semVazias(process.env)),
  });
  if (busca.modo === "palavras") {
    logger.info("EMBEDDINGS_PROVEDOR=nenhum: o conhecimento é buscado só por palavras");
  }
  const dependencias = { busca, historico: criarHistoricoPostgres(sql), fuso: config.fuso };
  const { redis, publicador, alertar } = prepararRedis(config, logger);
  // Orçamento de IA da pessoa: vale para as análises e o assistente, nos dois provedores.
  const orcamento = new PortaoOrcamento({
    fonte: { uso: banco.usoOrcamentoIa, registrar: banco.registrarGastoIa },
    log: logger,
    fuso: config.fuso,
    ...(alertar ? { alertar } : {}),
  });
  const sessoes = new SessoesPonte();
  const executor = prepararCli(config, sessoes, banco.credenciaisClaude, logger);
  const tokenClaude = prepararTokenClaude(config, executor, banco.credenciaisClaude, logger);
  const cliente = config.chaveAnthropic ? new Anthropic({ apiKey: config.chaveAnthropic }) : null;
  const provedorPadrao = cliente || !executor ? "api" : "cli";
  const configDaPessoa = configComPadrao(banco.configGravada, provedorPadrao);
  const porPessoa = new AnalistaPorPessoa({
    api: cliente
      ? new Analista({
          cliente,
          dependencias,
          modelo: config.modelo,
          aoFalharFerramenta: (erro, ferramenta) =>
            logger.error({ err: erro, ferramenta }, "ferramenta do analista falhou"),
        })
      : null,
    cli: executor ? new AnalistaCli({ executor, dependencias, tempoMs: config.timeoutMs }) : null,
    config: configDaPessoa,
  });
  const analista = new AnalistaComOrcamento(porPessoa, orcamento);
  const chat = new ServicoChat({
    dados: banco,
    busca,
    config: configDaPessoa,
    fuso: config.fuso,
    api: cliente ? new ChatApi({ cliente, modeloPadrao: config.modelo, fuso: config.fuso }) : null,
    cli: executor ? new ChatCli({ executor, tempoMs: config.chat.timeoutMs, fuso: config.fuso }) : null,
    orcamento,
    aoFalhar: (erro, ferramenta) =>
      ferramenta
        ? logger.error({ err: erro, ferramenta }, "ferramenta do assistente falhou")
        : logger.error({ err: erro }, "falha no assistente"),
  });
  const estado = (): EstadoAgenteAssistente => ({
    provedores: { api: cliente !== null, cli: executor !== null },
    provedorPadrao,
    contasCli: executor ? descreverContas(config.cli.contas, process.env["HOME"]) : [],
    modelos: MODELOS_SUGERIDOS,
    tokenClaude: tokenClaude.capacidade,
  });
  const fechar = () =>
    Promise.allSettled([
      tokenClaude.conexoes?.encerrarTodas(),
      sql.end({ timeout: 5 }),
      banco.fechar(),
      redis?.quit(),
    ]);
  return { analista, chat, estado, publicador, sessoes, tokenClaude, fechar };
}

/** Sobe o serviço do agente: valida o ambiente, monta os serviços e escuta na porta 8081. */
async function iniciar(): Promise<void> {
  const config = configDoAgente(process.env);
  const logger = pino({
    level: config.nivelLog,
    // O token do Claude e o código de autorização nunca vão para o log (nem por engano).
    redact: {
      paths: [
        "req.headers.authorization",
        "req.headers['x-zentrade-ponte']",
        "*.token",
        "*.codigo",
        "*.CLAUDE_CODE_OAUTH_TOKEN",
      ],
      censor: "[oculto]",
    },
    // Última barreira: qualquer sk-ant-… que sobrar na linha sai oculto.
    hooks: { streamWrite: ocultarTokensClaude },
  });
  const s = montarServicos(config, logger);
  const app = criarServidor({
    analista: s.analista,
    segredo: config.segredo,
    timeoutMs: config.timeoutMs,
    maxSimultaneas: config.maxSimultaneas,
    maxPorMinuto: config.maxPorMinuto,
    logger,
    publicador: s.publicador,
    ...(config.usuarioIdPadrao ? { usuarioIdPadrao: config.usuarioIdPadrao } : {}),
    extras: [
      (a) => registrarRotasPonte(a, s.sessoes, logger),
      (a) =>
        registrarRotasAssistente(a, {
          segredo: config.segredo,
          servico: s.chat,
          estado: s.estado,
          tempoMs: config.chat.timeoutMs,
          maxSimultaneas: config.chat.maxSimultaneas,
          maxPorMinuto: config.chat.maxPorMinuto,
        }),
      (a) =>
        registrarRotasTokenClaude(a, {
          segredo: config.segredo,
          conexoes: s.tokenClaude.conexoes,
          testar: s.tokenClaude.testar,
        }),
    ],
  });
  const encerrar = async (sinal: string) => {
    logger.info({ sinal }, "encerrando o agente");
    await app.close();
    await s.fechar();
  };
  process.once("SIGTERM", () => void encerrar("SIGTERM"));
  process.once("SIGINT", () => void encerrar("SIGINT"));
  await app.listen({ host: config.host, port: config.porta });
}

iniciar().catch((e: unknown) => {
  process.stderr.write(`Não foi possível iniciar o agente: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exitCode = 1;
});
