import Anthropic from "@anthropic-ai/sdk";
import { criarBuscaHibrida, criarRepositorioPostgres, embeddingsDoAmbiente } from "@zentrade/conhecimento";
import pino from "pino";
import postgres from "postgres";
import { Analista } from "./analista.js";
import { configDoAgente } from "./config.js";
import { criarHistoricoPostgres } from "./postgres/historico.js";
import { criarServidor } from "./servidor.js";

/** Sobe o serviço do agente: valida o ambiente, conecta no banco e escuta na porta 8081. */
async function iniciar(): Promise<void> {
  const config = configDoAgente(process.env);
  const logger = pino({ level: config.nivelLog, redact: ["req.headers.authorization"] });
  const sql = postgres(config.urlBanco, { max: 5 });
  const busca = criarBuscaHibrida({
    repositorio: criarRepositorioPostgres(sql),
    embeddings: embeddingsDoAmbiente(process.env),
  });
  const analista = new Analista({
    cliente: new Anthropic({ apiKey: config.chaveAnthropic }),
    dependencias: { busca, historico: criarHistoricoPostgres(sql) },
    modelo: config.modelo,
  });
  const app = criarServidor({
    analista,
    segredo: config.segredo,
    timeoutMs: config.timeoutMs,
    logger,
    ...(config.usuarioIdPadrao ? { usuarioIdPadrao: config.usuarioIdPadrao } : {}),
  });

  const encerrar = async (sinal: string) => {
    logger.info({ sinal }, "encerrando o agente");
    await app.close();
    await sql.end({ timeout: 5 });
  };
  process.once("SIGTERM", () => void encerrar("SIGTERM"));
  process.once("SIGINT", () => void encerrar("SIGINT"));

  await app.listen({ host: config.host, port: config.porta });
}

iniciar().catch((e: unknown) => {
  process.stderr.write(`Não foi possível iniciar o agente: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exitCode = 1;
});
