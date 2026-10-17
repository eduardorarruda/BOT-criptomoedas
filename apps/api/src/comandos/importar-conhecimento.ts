import { criarBanco, lerConfigBanco } from "@zentrade/banco";
import { semVazias } from "../config.js";
import { criarServicoArquivos } from "../integracoes/conhecimento-arquivos.js";
import { criarServicoConhecimento, prepararEmbeddings, repositorioRag } from "../integracoes/conhecimento.js";
import { executarImportacao } from "./importar.js";

// Da raiz do repositório (a pasta relativa vale de onde o pnpm foi chamado):
// pnpm --filter @zentrade/api importar-conhecimento -- --email ana@exemplo.com --pasta conhecimento/semente [--fonte nota]
// No Docker, veja docs/operacao.md (a pasta precisa estar dentro do container).

async function principal(): Promise<void> {
  const config = lerConfigBanco(process.env);
  const banco = criarBanco({
    url: config.DATABASE_URL,
    chaveMestra: config.ZENTRADE_CHAVE_MESTRA,
    maximoConexoes: 2,
  });
  try {
    const embeddings = prepararEmbeddings(semVazias(process.env));
    const repositorio = repositorioRag(banco);
    const conhecimento = criarServicoConhecimento({
      repositorio,
      documentos: banco.conhecimento,
      embeddings,
    });
    const arquivos = criarServicoArquivos({ conhecimento, banco, repositorio, embeddings, agora: Date.now });
    const resumo = await executarImportacao(
      process.argv.slice(2),
      { banco, arquivos, embeddings, escrever: (linha) => process.stdout.write(`${linha}\n`) },
      { base: process.env["INIT_CWD"] ?? process.cwd() },
    );
    if (resumo.falhas > 0) process.exitCode = 1;
  } finally {
    await banco.fechar();
  }
}

try {
  await principal();
} catch (erro) {
  console.error(`não foi possível importar o conhecimento: ${(erro as Error).message}`);
  process.exitCode = 1;
}
