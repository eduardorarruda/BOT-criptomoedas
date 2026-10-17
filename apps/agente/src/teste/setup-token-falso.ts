import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Um `claude setup-token` de mentira: nunca o CLI de verdade, nunca a rede, nunca um
 * token de verdade. Desenha a tela com cores como o app (link, "Paste code here"), espera
 * o código pela entrada e imprime um token falso se o código for o certo. Grava o que
 * recebeu (argumentos, ambiente, se a pasta de configuração nasceu vazia).
 */
export const LINK_FALSO =
  "https://claude.ai/oauth/authorize?code=true&client_id=falso&response_type=code&redirect_uri=https%3A%2F%2Fplatform.claude.com%2Foauth%2Fcode%2Fcallback&scope=user%3Ainference&state=estado-falso";
export const CODIGO_CERTO = "codigo-certo_123#estado-falso";
export const TOKEN_FALSO = `sk-ant-oat01-${"FaLsO_-9".repeat(12)}AbCd`;

/**
 * normal: link, código e token; mudo: nunca mostra o link; sai: fecha na hora;
 * lento: mostra o link e nunca responde ao código; fora: link de outro domínio.
 */
export type ModoFalso = "normal" | "mudo" | "sai" | "lento" | "fora";

export interface SetupTokenFalso {
  readonly caminho: string;
  recebido(): Promise<{ args: string[]; env: Record<string, string>; configVazia: boolean; tty: boolean }>;
  apagar(): Promise<void>;
}

const corpo = (registro: string, modo: ModoFalso) => `#!/usr/bin/env node
const fs = require("node:fs");
const dir = process.env.CLAUDE_CONFIG_DIR;
fs.writeFileSync(${JSON.stringify(registro)}, JSON.stringify({
  args: process.argv.slice(2),
  env: process.env,
  configVazia: !!dir && fs.existsSync(dir) && fs.readdirSync(dir).length === 0,
  tty: !!process.stdout.isTTY,
}));
const modo = ${JSON.stringify(modo)};
const E = String.fromCharCode(27);
const tela = (t) => process.stdout.write(t);
if (modo === "sai") process.exit(1);
tela(E + "[2J" + E + "[1mWelcome to Claude Code" + E + "[0m\\r\\n\\r\\n");
if (modo !== "mudo") {
  const link = modo === "fora" ? "https://claude.ai.exemplo.net/oauth/authorize?x=1" : ${JSON.stringify(LINK_FALSO)};
  tela("Browser didn't open? Use the url below to sign in\\r\\n\\r\\n" + E + "[2m" + link + E + "[0m\\r\\n\\r\\n");
  tela("Paste code here if prompted > ");
}
let entrada = "";
process.stdin.on("data", (d) => {
  entrada += d.toString();
  const m = /^([^\\r\\n]*)[\\r\\n]/.exec(entrada);
  if (!m || modo === "lento") return;
  if (m[1] === ${JSON.stringify(CODIGO_CERTO)}) {
    tela("\\r\\n" + E + "[32m✓ Long-lived authentication token created successfully!" + E + "[0m\\r\\n\\r\\n");
    tela("Your OAuth token (valid for 1 year):\\r\\n\\r\\n" + ${JSON.stringify(TOKEN_FALSO)} + "\\r\\n\\r\\n");
    tela("Store this token securely. You won't be able to see it again.\\r\\n");
    process.exit(0);
  }
  tela("\\r\\n" + E + "[31mOAuth error: Invalid code" + E + "[0m\\r\\n");
  process.exit(1);
});
setTimeout(() => process.exit(2), 60000);
`;

export async function criarSetupTokenFalso(modo: ModoFalso = "normal"): Promise<SetupTokenFalso> {
  const pasta = await mkdtemp(join(tmpdir(), "zt-setup-token-falso-"));
  const caminho = join(pasta, "claude");
  const registro = join(pasta, "recebido.json");
  await writeFile(caminho, corpo(registro, modo), { mode: 0o755 });
  await chmod(caminho, 0o755);
  return {
    caminho,
    recebido: async () => JSON.parse(await readFile(registro, "utf8")),
    apagar: () => rm(pasta, { recursive: true, force: true }),
  };
}
