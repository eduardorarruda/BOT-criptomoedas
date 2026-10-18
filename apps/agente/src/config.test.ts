import { describe, expect, it } from "vitest";
import { configDoAgente } from "./config.js";

const valido = {
  ANTHROPIC_API_KEY: "chave-falsa",
  AGENTE_SEGREDO: "a".repeat(32),
  DATABASE_URL: "postgres://zentrade:senha@localhost:55432/zentrade",
};

describe("configDoAgente", () => {
  it("aplica os padrões do contrato (porta 8081, claude-opus-5, timeout abaixo de 60 s)", () => {
    expect(configDoAgente(valido)).toMatchObject({
      porta: 8081,
      modelo: "claude-opus-5",
      timeoutMs: 55_000,
      nivelLog: "info",
    });
  });

  it("lista tudo o que falta, sem ecoar valores secretos", () => {
    const erro = (() => {
      try {
        configDoAgente({ AGENTE_SEGREDO: "curto-demais-segredo" });
      } catch (e) {
        return (e as Error).message;
      }
      return "";
    })();
    expect(erro).toMatch(/AGENTE_SEGREDO.*32/);
    expect(erro).toMatch(/DATABASE_URL/);
    expect(erro).not.toMatch(/curto-demais-segredo/);
  });

  it("aceita EMBEDDINGS_PROVEDOR nenhum (busca só por palavras); o padrão continua voyage", () => {
    expect(configDoAgente(valido).provedorEmbeddings).toBe("voyage");
    expect(configDoAgente({ ...valido, EMBEDDINGS_PROVEDOR: "nenhum" }).provedorEmbeddings).toBe("nenhum");
    expect(configDoAgente({ ...valido, EMBEDDINGS_PROVEDOR: "ollama" }).provedorEmbeddings).toBe("ollama");
    expect(() => configDoAgente({ ...valido, EMBEDDINGS_PROVEDOR: "openai" })).toThrow(
      /EMBEDDINGS_PROVEDOR.*voyage, ollama ou nenhum/,
    );
  });

  it("valida o usuário padrão como uuid", () => {
    expect(() => configDoAgente({ ...valido, ZENTRADE_USUARIO_ID: "ana" })).toThrow(/ZENTRADE_USUARIO_ID/);
    expect(
      configDoAgente({ ...valido, ZENTRADE_USUARIO_ID: "7b0c8a52-1d2e-4c3b-9a8f-0e1d2c3b4a59" })
        .usuarioIdPadrao,
    ).toBe("7b0c8a52-1d2e-4c3b-9a8f-0e1d2c3b4a59");
  });

  it("variável vazia conta como ausente (como .env.example e o docker-compose deixam)", () => {
    const c = configDoAgente({ ...valido, ZENTRADE_USUARIO_ID: "", LOG_LEVEL: "" });
    expect(c.usuarioIdPadrao).toBeUndefined();
    expect(c.nivelLog).toBe("info");
  });

  it("a chave da Anthropic e o Redis são opcionais; o Claude Code tem padrões e contas validadas", () => {
    const { ANTHROPIC_API_KEY: _k, ...semChave } = valido;
    const c = configDoAgente(semChave);
    expect(c.chaveAnthropic).toBeUndefined();
    expect(c.urlRedis).toBeUndefined();
    expect(c.cli).toEqual({
      caminho: "claude",
      contas: [{ id: "padrao", nome: "Login padrão do Claude Code", pasta: null }],
      maxTurnos: 8,
      tetoUsd: 1,
    });
    expect(c.chat).toEqual({ timeoutMs: 300_000, maxSimultaneas: 4, maxPorMinuto: 20 });
    const com = configDoAgente({
      ...valido,
      REDIS_URL: "redis://:s@127.0.0.1:56379",
      AGENTE_CLAUDE_CONTAS: "pessoal=/dados/claude/pessoal",
      AGENTE_CLI_TETO_USD: "0.5",
    });
    expect(com.urlRedis).toBe("redis://:s@127.0.0.1:56379");
    expect(com.cli.contas.map((x) => x.id)).toEqual(["pessoal"]);
    expect(com.cli.tetoUsd).toBe(0.5);
    expect(() => configDoAgente({ ...valido, REDIS_URL: "http://x" })).toThrow(/REDIS_URL/);
    expect(() => configDoAgente({ ...valido, AGENTE_CLAUDE_CONTAS: "x=relativa" })).toThrow(
      /AGENTE_CLAUDE_CONTAS/,
    );
  });
});

describe("chave mestra no agente (token do Claude Code de cada pessoa)", () => {
  const chave = Buffer.alloc(32, 7).toString("base64");

  it("é opcional: sem ela, o agente não usa nem conecta o token de ninguém", () => {
    expect(configDoAgente(valido).chaveMestra).toBeUndefined();
    expect(configDoAgente({ ...valido, ZENTRADE_CHAVE_MESTRA: "" }).chaveMestra).toBeUndefined();
  });

  it("lida em base64, 32 bytes", () => {
    expect(configDoAgente({ ...valido, ZENTRADE_CHAVE_MESTRA: chave }).chaveMestra).toEqual(
      Buffer.alloc(32, 7),
    );
  });

  it("chave inválida derruba a partida com o nome da variável, nunca o valor", () => {
    const curta = Buffer.alloc(16, 9).toString("base64");
    expect(() => configDoAgente({ ...valido, ZENTRADE_CHAVE_MESTRA: curta })).toThrow(
      /ZENTRADE_CHAVE_MESTRA.*32 bytes/,
    );
    try {
      configDoAgente({ ...valido, ZENTRADE_CHAVE_MESTRA: curta });
    } catch (e) {
      expect((e as Error).message).not.toContain(curta);
    }
  });

  it("prévias de futuro: limiar do cenário favorável (padrão 0,6, de 0,5 a 0,95) e fuso do pedido", () => {
    expect(configDoAgente(valido)).toMatchObject({ limiarCenarios: 0.6, fuso: "America/Sao_Paulo" });
    expect(configDoAgente({ ...valido, AGENTE_CENARIO_LIMIAR: "0.7" }).limiarCenarios).toBe(0.7);
    expect(() => configDoAgente({ ...valido, AGENTE_CENARIO_LIMIAR: "0.3" })).toThrow(
      /AGENTE_CENARIO_LIMIAR/,
    );
    expect(configDoAgente({ ...valido, ZENTRADE_FUSO: "Europe/Lisbon" }).fuso).toBe("Europe/Lisbon");
    expect(() => configDoAgente({ ...valido, ZENTRADE_FUSO: "Marte/Olimpo" })).toThrow(/ZENTRADE_FUSO.*IANA/);
  });
});
