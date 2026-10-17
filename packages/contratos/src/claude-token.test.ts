import { describe, expect, it } from "vitest";
import {
  CodigoAutorizacaoClaude,
  ConexaoClaudeEsquema,
  EstadoTokenClaudeEsquema,
  finalDoToken,
  ocultarTokensClaude,
  TokenClaude,
  urlAutorizacaoClaudeValida,
} from "./claude-token.js";

const TOKEN = `sk-ant-oat01-${"Ab3_-".repeat(19)}`;

describe("token do Claude Code (claude setup-token)", () => {
  it("aceita o formato sk-ant-oat, aparado e sem quebras de linha coladas junto", () => {
    expect(TokenClaude.parse(`  ${TOKEN}\n`)).toBe(TOKEN);
    expect(TokenClaude.parse(`${TOKEN.slice(0, 40)}\n${TOKEN.slice(40)}`)).toBe(TOKEN);
  });

  it("não depende dos dígitos da versão do token", () => {
    expect(TokenClaude.safeParse(TOKEN.replace("oat01", "oat02")).success).toBe(true);
    expect(TokenClaude.safeParse(TOKEN.replace("oat01", "oat")).success).toBe(true);
  });

  it("recusa a chave da API com uma explicação de onde achar o token certo", () => {
    const r = TokenClaude.safeParse(TOKEN.replace("oat01", "api03"));
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toMatch(/chave da API.*claude setup-token/);
  });

  it("recusa o que não parece token: curto, longo, outro prefixo, caractere estranho", () => {
    for (const ruim of [
      "sk-ant-oat01-curto",
      `${TOKEN}${"x".repeat(500)}`,
      `xx-${TOKEN}`,
      `${TOKEN.slice(0, 50)};rm -rf /${TOKEN.slice(50)}`,
      "",
    ]) {
      const r = TokenClaude.safeParse(ruim);
      expect(r.success, ruim.slice(0, 30)).toBe(false);
      expect(r.error?.issues[0]?.message).not.toContain(TOKEN.slice(20));
    }
  });

  it("guarda só o final para mostrar", () => {
    expect(finalDoToken(TOKEN)).toBe(`…${TOKEN.slice(-4)}`);
  });

  it("oculta qualquer token da Anthropic num texto (log, erro)", () => {
    const texto = `falhou com ${TOKEN} e sk-ant-api03-abcdefghijklmnop no meio`;
    const limpo = ocultarTokensClaude(texto);
    expect(limpo).not.toContain(TOKEN.slice(14));
    expect(limpo).not.toContain("abcdefghijklmnop");
    expect(limpo).toContain("falhou com sk-ant-[oculto]");
  });
});

describe("conectar pelo navegador", () => {
  it("só aceita a autorização num domínio da Anthropic, por https", () => {
    for (const boa of [
      "https://claude.ai/oauth/authorize?code=true&client_id=x",
      "https://claude.com/cai/oauth/authorize?x=1",
      "https://platform.claude.com/oauth/authorize",
      "https://console.anthropic.com/oauth/authorize",
    ]) {
      expect(urlAutorizacaoClaudeValida(boa), boa).toBe(true);
    }
    for (const ruim of [
      "http://claude.ai/oauth/authorize",
      "https://claude.ai.evil.com/oauth",
      "https://evilclaude.ai/oauth",
      "https://anthropic.com@evil.com/x",
      "javascript:alert(1)",
      "https://exemplo.com/?claude.ai",
      "não é url",
    ]) {
      expect(urlAutorizacaoClaudeValida(ruim), ruim).toBe(false);
    }
    expect(
      ConexaoClaudeEsquema.safeParse({
        conexaoId: "7b0c8a52-1d2e-4c3b-9a8f-0e1d2c3b4a59",
        urlAutorizacao: "https://evil.com/oauth",
        expiraEm: 1,
      }).success,
    ).toBe(false);
  });

  it("o código colado não pode levar teclas de controle para o terminal", () => {
    expect(CodigoAutorizacaoClaude.parse("  abcDEF123_-.~#xyz789  ")).toBe("abcDEF123_-.~#xyz789");
    for (const ruim of ["abc\r\nexit", "abc\u001b[A1234567", "curto", "a b c d e f g h", "x".repeat(700)]) {
      expect(CodigoAutorizacaoClaude.safeParse(ruim).success, JSON.stringify(ruim)).toBe(false);
    }
  });

  it("o estado nunca tem o token, só o final", () => {
    const vazio = {
      configurado: false,
      final: null,
      origem: null,
      criadaEm: null,
      validoAte: null,
      validadaEm: null,
      ultimoErro: null,
    };
    expect(EstadoTokenClaudeEsquema.parse(vazio)).toEqual(vazio);
    expect(EstadoTokenClaudeEsquema.safeParse({ ...vazio, final: TOKEN }).success).toBe(false);
  });
});
