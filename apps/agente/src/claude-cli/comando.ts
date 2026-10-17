/**
 * A linha de comando do `claude -p` (Claude Code 2.1.x, conferida com `claude --help`).
 * O CLI roda travado: sem ferramentas nativas (nada de Bash, Edit, Write, Read, WebFetch),
 * sem configurações do usuário (`--restricted`), sem outros servidores MCP
 * (`--strict-mcp-config`), sem comandos de barra, sem gravar sessão e com permissão
 * `dontAsk` — qualquer coisa fora da lista liberada é negada sozinha. Só as ferramentas
 * de leitura do ZenTrade, pela ponte MCP, ficam disponíveis.
 */
export const NOME_SERVIDOR_MCP = "zentrade";

/** Ferramentas nativas negadas explicitamente, além de `--tools ""` (cinto e suspensório). */
export const FERRAMENTAS_NEGADAS = [
  "Bash",
  "BashOutput",
  "KillShell",
  "Edit",
  "MultiEdit",
  "Write",
  "NotebookEdit",
  "Read",
  "Glob",
  "Grep",
  "WebFetch",
  "WebSearch",
  "Task",
  "Agent",
  "TodoWrite",
] as const;

/** Sem CLAUDE.md, regras e memória do usuário: instruções de programação não têm nada a ver aqui. */
export const CONFIGURACAO_CLI = {
  claudeMdExcludes: ["**/CLAUDE.md", "**/CLAUDE.local.md", "**/.claude/**"],
  autoMemoryEnabled: false,
};

export interface ParametrosComando {
  /** Arquivo com a configuração do servidor MCP (a ponte), na pasta da execução. */
  readonly configMcp: string;
  /** Arquivo com o system prompt do ZenTrade (substitui o do Claude Code). */
  readonly instrucoes: string;
  readonly modelo: string | null;
  readonly maxTurnos: number;
  readonly tetoUsd: number;
}

function comuns(p: ParametrosComando): string[] {
  const args = [
    "-p",
    "--restricted",
    "--strict-mcp-config",
    "--mcp-config",
    p.configMcp,
    "--tools",
    "",
    "--allowedTools",
    `mcp__${NOME_SERVIDOR_MCP}`,
    "--disallowedTools",
    FERRAMENTAS_NEGADAS.join(","),
    "--permission-mode",
    "dontAsk",
    "--settings",
    JSON.stringify(CONFIGURACAO_CLI),
    "--disable-slash-commands",
    "--no-session-persistence",
    "--system-prompt-file",
    p.instrucoes,
    "--max-turns",
    String(p.maxTurnos),
    "--max-budget-usd",
    String(p.tetoUsd),
  ];
  return p.modelo ? [...args, "--model", p.modelo] : args;
}

/** Análise: uma resposta só, em JSON, validada contra o esquema da PropostaAgente. */
export function argumentosAnalise(p: ParametrosComando, esquema: object): string[] {
  return [...comuns(p), "--output-format", "json", "--json-schema", JSON.stringify(esquema)];
}

/** Chat: JSON por linha, com os pedaços de texto conforme chegam. */
export function argumentosChat(p: ParametrosComando): string[] {
  return [...comuns(p), "--output-format", "stream-json", "--verbose", "--include-partial-messages"];
}

/** Teste do token: uma resposta só, em JSON, sem esquema (1 volta, teto baixo). */
export function argumentosTeste(p: ParametrosComando): string[] {
  return [...comuns(p), "--output-format", "json"];
}

/** O arquivo `--mcp-config`: a ponte MCP do ZenTrade como servidor stdio. */
export function configuracaoMcp(ponte: {
  readonly comando: string;
  readonly args: readonly string[];
  readonly env: Readonly<Record<string, string>>;
}): string {
  return JSON.stringify({
    mcpServers: {
      [NOME_SERVIDOR_MCP]: {
        type: "stdio",
        command: ponte.comando,
        args: [...ponte.args],
        env: { ...ponte.env },
      },
    },
  });
}
