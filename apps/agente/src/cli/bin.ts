#!/usr/bin/env node
import { createInterface } from "node:readline/promises";
import { executarCli } from "./cli.js";

async function perguntar(pergunta: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await rl.question(pergunta);
  } finally {
    rl.close();
  }
}

executarCli(process.argv.slice(2), {
  env: process.env,
  saida: process.stdout,
  erro: process.stderr,
  perguntar,
})
  .then((codigo) => {
    process.exitCode = codigo;
  })
  .catch((e: unknown) => {
    process.stderr.write(`Erro inesperado: ${e instanceof Error ? e.message : String(e)}\n`);
    process.exitCode = 1;
  });
