#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { criarPonte, urlPermitida } from "./ponte.js";

// Iniciada pelo Claude Code (stdio). A saída padrão é do protocolo: avisos vão no stderr.
async function iniciar(): Promise<void> {
  const url = process.env["ZT_PONTE_URL"] ?? "";
  const acesso = process.env["ZT_PONTE_ACESSO"] ?? "";
  if (!urlPermitida(url) || acesso.length < 32) {
    process.stderr.write("Ponte do ZenTrade: ZT_PONTE_URL ou ZT_PONTE_ACESSO ausentes ou inválidos.\n");
    process.exitCode = 2;
    return;
  }
  await criarPonte({ url, acesso }).connect(new StdioServerTransport());
}

iniciar().catch((e: unknown) => {
  process.stderr.write(`Ponte do ZenTrade falhou: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exitCode = 1;
});
