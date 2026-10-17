import { executarImportacaoCsv, lerArquivoLimitado } from "../dados-b3/comandos.js";
import { abrirBancoDosComandos } from "./banco.js";

// Candles de um CSV (exportação do MetaTrader 5 ou genérico). Da raiz do repositório:
// pnpm --filter @zentrade/motor importar-candles-csv -- --simbolo WIN --intervalo 5m --arquivo WIN.csv [--fuso America/Sao_Paulo]
// No Docker, o arquivo precisa estar dentro do container: veja docs/dados-b3.md.

async function principal(): Promise<void> {
  const banco = abrirBancoDosComandos(process.env);
  try {
    await executarImportacaoCsv(process.argv.slice(2), {
      banco: banco.mercado,
      agora: Date.now,
      escrever: (linha) => process.stdout.write(`${linha}\n`),
      lerArquivo: (caminho) => lerArquivoLimitado(caminho),
      base: process.env["INIT_CWD"] ?? process.cwd(),
    });
  } finally {
    await banco.fechar();
  }
}

try {
  await principal();
} catch (erro) {
  console.error(`não foi possível importar o CSV: ${(erro as Error).message}`);
  process.exitCode = 1;
}
