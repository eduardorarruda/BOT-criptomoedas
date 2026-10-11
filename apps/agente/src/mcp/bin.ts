#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ClienteApi, configDaApi } from "../api/cliente-api.js";
import { criarServidorMcp } from "./servidor-mcp.js";

// No transporte stdio, a saída padrão é do protocolo: mensagens para gente vão no stderr.
async function iniciar(): Promise<void> {
  const servidor = criarServidorMcp(new ClienteApi(configDaApi(process.env)));
  await servidor.connect(new StdioServerTransport());
}

iniciar().catch((e: unknown) => {
  process.stderr.write(
    `Não foi possível iniciar o MCP do ZenTrade: ${e instanceof Error ? e.message : String(e)}\n`,
  );
  process.exitCode = 1;
});
