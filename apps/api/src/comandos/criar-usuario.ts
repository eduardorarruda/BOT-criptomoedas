import { criarBanco, lerConfigBanco } from "@zentrade/banco";
import { criarUsuario, lerArgumentos } from "./usuario.js";

// pnpm --filter @zentrade/api criar-usuario -- --email ana@exemplo.com --nome "Ana"
// A senha é pedida sem eco no terminal (ou lida da entrada padrão, se vier por pipe).

function lerSenhaOculta(pergunta: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const entrada = process.stdin;
    let senha = "";
    const fim = () => {
      entrada.setRawMode(false);
      entrada.pause();
      entrada.off("data", aoDado);
      process.stdout.write("\n");
    };
    const aoDado = (pedaco: string) => {
      for (const c of pedaco) {
        if (c === "\r" || c === "\n") return (fim(), resolve(senha));
        if (c === "\u0003") return (fim(), reject(new Error("cancelado")));
        senha = c === "\u007f" ? senha.slice(0, -1) : senha + c;
      }
    };
    process.stdout.write(pergunta);
    entrada.setRawMode(true);
    entrada.setEncoding("utf8");
    entrada.on("data", aoDado);
    entrada.resume();
  });
}

async function lerSenhaDoPipe(): Promise<string> {
  let texto = "";
  for await (const pedaco of process.stdin) texto += String(pedaco);
  return texto.split(/\r?\n/)[0] ?? "";
}

async function lerSenha(): Promise<string> {
  if (!process.stdin.isTTY) return lerSenhaDoPipe();
  const senha = await lerSenhaOculta("Senha (mínimo 12 caracteres): ");
  if ((await lerSenhaOculta("Repita a senha: ")) !== senha) throw new Error("as senhas não conferem");
  return senha;
}

async function principal(): Promise<void> {
  const args = lerArgumentos(process.argv.slice(2));
  const config = lerConfigBanco(process.env);
  const banco = criarBanco({
    url: config.DATABASE_URL,
    chaveMestra: config.ZENTRADE_CHAVE_MESTRA,
    maximoConexoes: 1,
  });
  try {
    const usuario = await criarUsuario(banco, {
      email: args.email ?? "",
      nome: args.nome ?? "",
      senha: await lerSenha(),
    });
    process.stdout.write(
      `pessoa criada: ${usuario.email} (${usuario.id}). Ative o 2FA pela tela antes de operar dinheiro real.\n`,
    );
  } finally {
    await banco.fechar();
  }
}

try {
  await principal();
} catch (erro) {
  console.error(`não foi possível criar a pessoa: ${(erro as Error).message}`);
  process.exitCode = 1;
}
