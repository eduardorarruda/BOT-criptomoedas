import { criarBanco, lerConfigBanco } from "@zentrade/banco";
import { semVazias } from "../config.js";
import { prepararEmbeddings } from "../integracoes/conhecimento.js";
import { executarReindexacao } from "./reindexar.js";

// Depois de configurar um provedor de verdade (voyage ou ollama) no lugar de nenhum:
// pnpm --filter @zentrade/api reindexar-conhecimento [-- --email ana@exemplo.com] [--lote 64]
// Pode rodar de novo quantas vezes quiser: só calcula o que ainda falta.

async function principal(): Promise<void> {
  const config = lerConfigBanco(process.env);
  const banco = criarBanco({
    url: config.DATABASE_URL,
    chaveMestra: config.ZENTRADE_CHAVE_MESTRA,
    maximoConexoes: 2,
  });
  try {
    await executarReindexacao(process.argv.slice(2), {
      banco,
      embeddings: prepararEmbeddings(semVazias(process.env)),
      escrever: (linha) => process.stdout.write(`${linha}\n`),
    });
  } finally {
    await banco.fechar();
  }
}

try {
  await principal();
} catch (erro) {
  console.error(`não foi possível reindexar o conhecimento: ${(erro as Error).message}`);
  process.exitCode = 1;
}
