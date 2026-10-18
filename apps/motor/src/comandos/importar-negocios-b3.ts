import { conferirArquivoNegocios, blocosDoArquivo } from "../dados-b3/arquivo-negocios.js";
import { executarImportacaoNegocios } from "../dados-b3/comando-negocios.js";
import { abrirBancoDosComandos } from "./banco.js";

// Velas do WIN a partir dos arquivos "Negócio a negócio" de derivativos da B3 (baixados à
// mão no BDI). Da raiz do repositório:
// pnpm --filter @zentrade/motor importar-negocios-b3 -- --arquivos ~/Downloads/*_NEGOCIOSAVISTA_DRV.zip [--ajuste nenhum|diferenca]
// No Docker, monte a pasta dos arquivos no container: veja docs/dados-b3.md.

async function principal(): Promise<void> {
  const banco = abrirBancoDosComandos(process.env);
  try {
    await executarImportacaoNegocios(process.argv.slice(2), {
      banco: banco.mercado,
      agora: Date.now,
      escrever: (linha) => process.stdout.write(`${linha}\n`),
      base: process.env["INIT_CWD"] ?? process.cwd(),
      blocos: blocosDoArquivo,
      conferir: conferirArquivoNegocios,
    });
  } finally {
    await banco.fechar();
  }
}

try {
  await principal();
} catch (erro) {
  console.error(`não foi possível importar os negócios da B3: ${(erro as Error).message}`);
  process.exitCode = 1;
}
