import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { carregarFluxos, RAIZ } from "./fluxos.js";

/**
 * Nada de segredo em claro nos fluxos nem na documentação: tokens, chaves e senhas
 * ficam em credenciais do n8n (cifradas no banco dele) ou em variáveis de ambiente.
 */
const PADROES: readonly (readonly [string, RegExp])[] = [
  ["token de bot do Telegram", /\b\d{8,10}:[A-Za-z0-9_-]{35}\b/],
  ["cabeçalho Bearer com valor", /Bearer\s+[A-Za-z0-9._~+/-]{16,}/],
  ["JWT", /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./],
  ["chave privada", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ["chave de acesso AWS", /\bAKIA[0-9A-Z]{16}\b/],
  ["chave estilo OpenAI/Anthropic", /\bsk-[A-Za-z0-9_-]{20,}/],
  ["sequência hexadecimal longa", /\b[0-9a-fA-F]{40,}\b/],
  ["chave estilo Binance (64 caracteres)", /\b[A-Za-z0-9]{64}\b/],
  [
    "campo de segredo preenchido",
    /"(hmacSecret|accessToken|password|senha|apiSecret|apiKey|secret|token)"\s*:\s*"[^"]+"/i,
  ],
  [
    "atribuição de segredo preenchida",
    /\b(N8N_WEBHOOK_SEGREDO|AGENTE_SEGREDO|BINANCE_API_SECRET)=[^\s<`]{8,}/,
  ],
];

const achados = (texto: string): string[] =>
  PADROES.filter(([, padrao]) => padrao.test(texto)).map(([nome]) => nome);

const documentos = (): { arquivo: string; texto: string }[] => {
  const pastas = ["docs", "docs/adr", "infra/n8n"];
  return pastas.flatMap((pasta) => {
    let nomes: string[];
    try {
      nomes = readdirSync(join(RAIZ, pasta)).filter((f) => f.endsWith(".md"));
    } catch {
      nomes = [];
    }
    return nomes.map((f) => ({
      arquivo: `${pasta}/${f}`,
      texto: readFileSync(join(RAIZ, pasta, f), "utf8"),
    }));
  });
};

const CREDENCIAIS_PERMITIDAS = new Map([
  ["ZenTrade Telegram", "telegramApi"],
  ["ZenTrade assinatura dos webhooks", "crypto"],
  ["ZenTrade token leitura", "httpHeaderAuth"],
  ["ZenTrade token operar", "httpHeaderAuth"],
  ["ZenTrade SMTP", "smtp"],
]);

describe("detector de segredos", () => {
  // Exemplos montados em tempo de execução para o próprio teste não virar alarme na CI.
  const falsos = [
    `${"1234567890"}:${"A".repeat(35)}`,
    `Authorization: Bearer ${"x".repeat(24)}`,
    `"hmacSecret": "${"q".repeat(8)}"`,
    "f".repeat(48),
    `N8N_WEBHOOK_SEGREDO=${"z".repeat(32)}`,
  ];

  it.each(falsos)("reconhece um segredo de mentira (%#)", (exemplo) => {
    expect(achados(exemplo)).not.toEqual([]);
  });

  it("não acusa ids de nó, placeholders nem expressões", () => {
    expect(achados('"id": "7f3a1c2e-9b4d-4e8f-a1b2-c3d4e5f60718"')).toEqual([]);
    expect(achados("N8N_WEBHOOK_SEGREDO=<gere com openssl rand -hex 32>")).toEqual([]);
    expect(achados('"value": "={{ $json.assinatura }}"')).toEqual([]);
  });
});

describe.each(carregarFluxos().map((a) => [a.arquivo, a] as const))("%s", (_arquivo, { texto, fluxo }) => {
  it("não tem segredo em claro", () => {
    expect(achados(texto)).toEqual([]);
  });

  it("referencia credenciais só pelo nome combinado, sem dados", () => {
    for (const n of fluxo.nodes) {
      for (const [tipo, ref] of Object.entries(n.credentials ?? {})) {
        expect(Object.keys(ref).sort()).toEqual(["id", "name"]);
        expect(CREDENCIAIS_PERMITIDAS.get(ref.name), `credencial inesperada: ${ref.name}`).toBe(tipo);
        expect(ref.id).toMatch(/^ztCred[A-Za-z0-9]{10}$/);
      }
    }
  });

  it("não escreve Authorization à mão: o token vem da credencial", () => {
    for (const n of fluxo.nodes) {
      const cabecalhos = (n.parameters.headerParameters as { parameters?: { name: string }[] } | undefined)
        ?.parameters;
      for (const c of cabecalhos ?? []) expect(c.name.toLowerCase()).not.toBe("authorization");
    }
  });
});

describe("variáveis de ambiente", () => {
  const usadas = new Set(
    carregarFluxos().flatMap((a) => [...a.texto.matchAll(/\$env\.([A-Z0-9_]+)/g)].map((m) => m[1] as string)),
  );
  const leiaMe = readFileSync(join(RAIZ, "infra/n8n/README.md"), "utf8");

  it("toda variável usada pelos fluxos está documentada em infra/n8n/README.md", () => {
    expect(usadas.size).toBeGreaterThan(0);
    for (const v of usadas) expect(leiaMe, `variável sem documentação: ${v}`).toContain(v);
  });

  it("nenhuma variável de ambiente guarda segredo: segredos vão em credenciais", () => {
    for (const v of usadas) expect(v).not.toMatch(/SEGREDO|SECRET|TOKEN|SENHA|PASSWORD|KEY/);
  });
});

describe.each(documentos().map((d) => [d.arquivo, d.texto] as const))("documento %s", (_arquivo, texto) => {
  it("não tem segredo em claro", () => {
    expect(achados(texto)).toEqual([]);
  });
});
