import { dirname } from "node:path";

/**
 * O ambiente em que o `claude` roda. Começa vazio e só recebe o necessário para ele achar
 * o login da conta e sair para a rede. NUNCA leva: ANTHROPIC_API_KEY nem
 * ANTHROPIC_AUTH_TOKEN (o CLI cobraria por uso, e as duas passam na frente do token do
 * plano), DATABASE_URL, AGENTE_SEGREDO, ZENTRADE_CHAVE_MESTRA, REDIS_URL, chaves da Voyage
 * nem variáveis que injetam código (NODE_OPTIONS, LD_PRELOAD). O token do plano da pessoa
 * (CLAUDE_CODE_OAUTH_TOKEN) só entra quando o executor o passa em `extras`.
 */
const BASICAS = [
  "HOME",
  "USER",
  "LOGNAME",
  "LANG",
  "LANGUAGE",
  "TZ",
  "TMPDIR",
  "XDG_CONFIG_HOME",
  "XDG_DATA_HOME",
  "XDG_CACHE_HOME",
  "XDG_STATE_HOME",
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "NO_PROXY",
  "http_proxy",
  "https_proxy",
  "no_proxy",
  "SSL_CERT_FILE",
  "SSL_CERT_DIR",
  "NODE_EXTRA_CA_CERTS",
  // Alpine (musl): o ripgrep do sistema em vez do embutido (documentação do Claude Code).
  "USE_BUILTIN_RIPGREP",
] as const;

/** Cinto e suspensório: nem por `extras` estas passam (têm precedência sobre o token do plano). */
const SEMPRE_FORA: ReadonlySet<string> = new Set([
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_AUTH_TOKEN",
  "ANTHROPIC_BASE_URL",
]);

export function ambienteLimpo(
  origem: Readonly<Record<string, string | undefined>>,
  extras: Readonly<Record<string, string>>,
  caminhoCli: string,
): Record<string, string> {
  const env: Record<string, string> = {};
  for (const chave of BASICAS) {
    const valor = origem[chave];
    if (valor !== undefined) env[chave] = valor;
  }
  for (const [chave, valor] of Object.entries(origem)) {
    if (chave.startsWith("LC_") && valor !== undefined) env[chave] = valor;
  }
  // O Node vem primeiro: a ponte MCP é um script Node, e o CLI pode ser um também.
  const pastas = [dirname(process.execPath), dirname(caminhoCli), ...(origem["PATH"] ?? "").split(":")];
  env["PATH"] = [...new Set(pastas.filter((p) => p !== "" && p !== "."))].join(":");
  env["NO_COLOR"] = "1";
  env["TERM"] = "dumb";
  env["CI"] = "1";
  env["DISABLE_AUTOUPDATER"] = "1";
  return Object.fromEntries(
    Object.entries({ ...env, ...extras }).filter(([chave]) => !SEMPRE_FORA.has(chave)),
  );
}
