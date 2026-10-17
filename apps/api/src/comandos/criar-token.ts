import { criarBanco, lerConfigBanco } from "@zentrade/banco";
import { criarTokenPorEmail } from "./token.js";

// pnpm --filter @zentrade/api criar-token -- --email ana@exemplo.com --nome terminal --escopo leitura
// Só o token vai para a saída padrão (para redirecionar direto a um arquivo); o resto
// vai para a saída de erro. Ex.: ... criar-token.js --email ... > ~/.config/zentrade/token

async function principal(): Promise<void> {
  const config = lerConfigBanco(process.env);
  const banco = criarBanco({
    url: config.DATABASE_URL,
    chaveMestra: config.ZENTRADE_CHAVE_MESTRA,
    maximoConexoes: 1,
  });
  try {
    const r = await criarTokenPorEmail(process.argv.slice(2), banco);
    process.stdout.write(`${r.token}\n`);
    process.stderr.write(`token "${r.nome}" (${r.escopo}) criado; ele não é mostrado de novo.\n`);
  } finally {
    await banco.fechar();
  }
}

principal().catch((erro: unknown) => {
  process.stderr.write(`Não foi possível criar o token: ${(erro as Error).message}\n`);
  process.exitCode = 1;
});
