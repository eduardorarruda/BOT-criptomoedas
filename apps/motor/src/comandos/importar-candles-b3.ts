import { criarFonteBrapi } from "../dados-b3/brapi.js";
import { executarImportacaoB3 } from "../dados-b3/comandos.js";
import { abrirBancoDosComandos } from "./banco.js";

// Ibovespa intradiário (aproximação do WIN), gravado como WIN-IBOV. Da raiz do repositório:
// pnpm --filter @zentrade/motor importar-candles-b3 -- --fonte brapi --intervalo 5m --desde 2026-09-01
// Precisa de DATABASE_URL e BRAPI_TOKEN (plano Pro para intradiário). No Docker, veja docs/dados-b3.md.

async function principal(): Promise<void> {
  const banco = abrirBancoDosComandos(process.env);
  try {
    await executarImportacaoB3(process.argv.slice(2), {
      banco: banco.mercado,
      fontes: { brapi: () => criarFonteBrapi({ token: process.env["BRAPI_TOKEN"]?.trim() || undefined }) },
      agora: Date.now,
      escrever: (linha) => process.stdout.write(`${linha}\n`),
    });
  } finally {
    await banco.fechar();
  }
}

try {
  await principal();
} catch (erro) {
  console.error(`não foi possível importar os candles da B3: ${(erro as Error).message}`);
  process.exitCode = 1;
}
