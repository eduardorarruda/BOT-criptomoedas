import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Um `claude` de mentira para os testes: nunca o CLI de verdade, nunca a rede. É um
 * script Node (CommonJS) que grava o que recebeu (argumentos, entrada, ambiente, a
 * configuração do MCP e as instruções) e roda o `corpo` dado pelo teste, que pode chamar
 * as ferramentas pela ponte de verdade (`await ferramenta(nome, entrada)`) e escrever a
 * saída com `sair(objeto)` (uma linha JSON) ou `linha(objeto)`.
 */
export interface ClaudeFalso {
  readonly caminho: string;
  /** O que o falso recebeu na última execução. */
  recebido(): Promise<Recebido>;
  apagar(): Promise<void>;
}

export interface Recebido {
  readonly args: string[];
  readonly entrada: string;
  readonly env: Record<string, string>;
  readonly mcp: {
    mcpServers: Record<string, { command: string; args: string[]; env: Record<string, string> }>;
  };
  readonly instrucoes: string;
}

const CABECALHO = `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
const valor = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };
const entrada = fs.readFileSync(0, "utf8");
const mcp = JSON.parse(fs.readFileSync(valor("--mcp-config"), "utf8"));
const instrucoes = fs.readFileSync(valor("--system-prompt-file"), "utf8");
fs.writeFileSync(__REGISTRO__, JSON.stringify({ args, entrada, env: process.env, mcp, instrucoes }));
const ponte = mcp.mcpServers.zentrade.env;
async function ferramenta(nome, e) {
  const r = await fetch(ponte.ZT_PONTE_URL + "/" + nome, {
    method: "POST",
    headers: { "x-zentrade-ponte": ponte.ZT_PONTE_ACESSO, "content-type": "application/json" },
    body: JSON.stringify({ entrada: e }),
  });
  return r.json();
}
const linha = (o) => process.stdout.write(JSON.stringify(o) + "\\n");
const sair = (o, codigo = 0) => { linha(o); process.exitCode = codigo; };
`;

export async function criarClaudeFalso(corpo: string): Promise<ClaudeFalso> {
  const pasta = await mkdtemp(join(tmpdir(), "zt-claude-falso-"));
  const caminho = join(pasta, "claude");
  const registro = join(pasta, "recebido.json");
  const script = `${CABECALHO.replace("__REGISTRO__", JSON.stringify(registro))}(async () => {\n${corpo}\n})();\n`;
  await writeFile(caminho, script, { mode: 0o755 });
  await chmod(caminho, 0o755);
  return {
    caminho,
    recebido: async () => JSON.parse(await readFile(registro, "utf8")) as Recebido,
    apagar: () => rm(pasta, { recursive: true, force: true }),
  };
}

/** O "result" que o `claude -p --output-format json` imprime no fim. */
export const resultadoCli = (extra: Record<string, unknown> = {}) => ({
  type: "result",
  subtype: "success",
  is_error: false,
  result: "",
  total_cost_usd: 0.0123,
  num_turns: 2,
  ...extra,
});
