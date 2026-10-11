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
    expect(c.embeddings).toBeNull();
  });

  it("monta a configuração de embeddings só quando a URL existe", () => {
    const c = lerConfig({ ...valido, EMBEDDINGS_URL: "http://127.0.0.1:11434/v1/embeddings" });
    expect(c.embeddings).toEqual({ url: "http://127.0.0.1:11434/v1/embeddings", modelo: "bge-m3" });
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
});
