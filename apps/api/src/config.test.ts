import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { lerConfig } from "./config.js";

const valido = {
  DATABASE_URL: "postgres://u:s@127.0.0.1:55432/zentrade",
  ZENTRADE_CHAVE_MESTRA: randomBytes(32).toString("base64"),
  REDIS_URL: "redis://:senha@127.0.0.1:56379",
  N8N_WEBHOOK_SEGREDO: "s".repeat(32),
};

describe("configuração da API", () => {
  it("aplica padrões seguros", () => {
    const c = lerConfig(valido);
    expect(c.API_HOST).toBe("127.0.0.1");
    expect(c.API_PORTA).toBe(8080);
    expect(c.ZENTRADE_ORIGEM_WEB).toBe("http://localhost:5173");
    expect(c.COOKIE_SEGURO).toBe(true);
    expect(c.APROVACAO_VALIDADE_MIN).toBe(15);
    expect(c.EMBEDDINGS_PROVEDOR).toBe("voyage");
    expect(c.LOG_LEVEL).toBe("info");
  });

  it("confere o provedor de embeddings e o nível de log unificados", () => {
    expect(lerConfig({ ...valido, EMBEDDINGS_PROVEDOR: "ollama" }).EMBEDDINGS_PROVEDOR).toBe("ollama");
    expect(lerConfig({ ...valido, EMBEDDINGS_PROVEDOR: "nenhum" }).EMBEDDINGS_PROVEDOR).toBe("nenhum");
    expect(() => lerConfig({ ...valido, EMBEDDINGS_PROVEDOR: "openai" })).toThrow(/voyage, ollama ou nenhum/);
    expect(lerConfig({ ...valido, LOG_LEVEL: "silent" }).LOG_LEVEL).toBe("silent");
    expect(() => lerConfig({ ...valido, LOG_LEVEL: "verboso" })).toThrow(/LOG_LEVEL/);
  });

  it("recusa segredo de webhook curto e diz como resolver", () => {
    expect(() => lerConfig({ ...valido, N8N_WEBHOOK_SEGREDO: "curto" })).toThrow(/32 caracteres/);
  });

  it("lista tudo o que falta de uma vez, sem mostrar valores", () => {
    let mensagem = "";
    try {
      lerConfig({ ZENTRADE_CHAVE_MESTRA: "nao-mostre-isto" });
    } catch (erro) {
      mensagem = (erro as Error).message;
    }
    expect(mensagem).toMatch(/DATABASE_URL/);
    expect(mensagem).toMatch(/REDIS_URL/);
    expect(mensagem).not.toContain("nao-mostre-isto");
  });

  it("COOKIE_SEGURO=false só se pedido explicitamente", () => {
    expect(lerConfig({ ...valido, COOKIE_SEGURO: "false" }).COOKIE_SEGURO).toBe(false);
    expect(() => lerConfig({ ...valido, COOKIE_SEGURO: "talvez" })).toThrow();
  });

  it("variável vazia conta como ausente (como .env.example e o docker-compose deixam)", () => {
    const c = lerConfig({ ...valido, N8N_USUARIO_ID: "", AGENTE_URL: "", LOG_LEVEL: "" });
    expect(c.N8N_USUARIO_ID).toBeUndefined();
    expect(c.AGENTE_URL).toBeUndefined();
    expect(c.LOG_LEVEL).toBe("info");
  });

  it("contatos da LGPD são opcionais e andam em par (nome + e-mail)", () => {
    const sem = lerConfig(valido);
    expect(sem.ZENTRADE_CONTROLADOR_NOME).toBeUndefined();
    const com = lerConfig({
      ...valido,
      ZENTRADE_CONTROLADOR_NOME: " Ana Exemplo ",
      ZENTRADE_CONTROLADOR_EMAIL: "privacidade@exemplo.com",
    });
    expect(com.ZENTRADE_CONTROLADOR_NOME).toBe("Ana Exemplo");
    expect(() => lerConfig({ ...valido, ZENTRADE_CONTROLADOR_NOME: "Ana" })).toThrow(
      /ZENTRADE_CONTROLADOR_EMAIL: defina ZENTRADE_CONTROLADOR_NOME e ZENTRADE_CONTROLADOR_EMAIL juntos/,
    );
    expect(() => lerConfig({ ...valido, ZENTRADE_ENCARREGADO_EMAIL: "dpo@exemplo.com" })).toThrow(
      /ZENTRADE_ENCARREGADO_NOME: defina/,
    );
    expect(() =>
      lerConfig({ ...valido, ZENTRADE_CONTROLADOR_NOME: "Ana", ZENTRADE_CONTROLADOR_EMAIL: "nao-e-email" }),
    ).toThrow(/precisa ser um e-mail/);
  });
});
