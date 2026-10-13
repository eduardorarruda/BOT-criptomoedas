import { randomBytes } from "node:crypto";
import rateLimit from "@fastify/rate-limit";
import { ConfigPublicaEsquema } from "@zentrade/contratos";
import Fastify from "fastify";
import { serializerCompiler, validatorCompiler } from "fastify-type-provider-zod";
import { afterEach, describe, expect, it } from "vitest";
import { lerConfig } from "../config.js";
import type { Dependencias } from "../dependencias.js";
import {
  CACHE_CONFIG_PUBLICA,
  configPublica,
  LIMITE_CONFIG_PUBLICA,
  lerVersao,
  rotasPublico,
} from "./publico.js";

const base = {
  DATABASE_URL: "postgres://u:s@127.0.0.1:55432/zentrade",
  ZENTRADE_CHAVE_MESTRA: randomBytes(32).toString("base64"),
  REDIS_URL: "redis://:senha@127.0.0.1:56379",
  N8N_WEBHOOK_SEGREDO: "s".repeat(32),
};

const comControlador = {
  ...base,
  ZENTRADE_CONTROLADOR_NOME: "Ana Exemplo",
  ZENTRADE_CONTROLADOR_EMAIL: "privacidade@exemplo.com",
};

/** Só o necessário para a rota: ela não toca banco, Redis nem sessão. */
async function montar(env: Record<string, string>) {
  const app = Fastify();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  await app.register(rateLimit, { max: 1000, timeWindow: "1 minute" });
  const deps = { config: lerConfig(env) } as unknown as Dependencias;
  await app.register(rotasPublico, { prefix: "/api/v1", deps });
  return app;
}

let aberto: Awaited<ReturnType<typeof montar>> | undefined;
afterEach(async () => {
  await aberto?.close();
  aberto = undefined;
});

describe("GET /api/v1/publico/config", () => {
  it("devolve o controlador configurado, a versão e cache público curto", async () => {
    aberto = await montar(comControlador);
    const r = await aberto.inject({ method: "GET", url: "/api/v1/publico/config" });
    expect(r.statusCode).toBe(200);
    expect(r.headers["cache-control"]).toBe(CACHE_CONFIG_PUBLICA);
    const corpo = ConfigPublicaEsquema.parse(r.json());
    expect(corpo.controlador).toEqual({ nome: "Ana Exemplo", email: "privacidade@exemplo.com" });
    expect(corpo.encarregado).toBeNull();
    expect(corpo.versao).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("sem configuração, controlador e encarregado vêm nulos (a tela mostra o aviso ao operador)", async () => {
    aberto = await montar(base);
    const r = await aberto.inject({ method: "GET", url: "/api/v1/publico/config" });
    expect(r.json()).toMatchObject({ controlador: null, encarregado: null });
  });

  it("não expõe nada além dos três campos", async () => {
    aberto = await montar({ ...comControlador, BRAPI_TOKEN: "segredo-que-nao-sai" });
    const r = await aberto.inject({ method: "GET", url: "/api/v1/publico/config" });
    expect(Object.keys(r.json() as object).sort()).toEqual(["controlador", "encarregado", "versao"]);
    expect(r.body).not.toContain("segredo-que-nao-sai");
    expect(r.body).not.toContain("postgres://");
  });

  it("tem limite de pedidos próprio, como as outras rotas públicas", async () => {
    aberto = await montar(base);
    let ultimo = 0;
    for (let i = 0; i <= LIMITE_CONFIG_PUBLICA.max; i++) {
      ultimo = (await aberto.inject({ method: "GET", url: "/api/v1/publico/config" })).statusCode;
    }
    expect(ultimo).toBe(429);
  });
});

describe("config pública (função)", () => {
  it("encarregado próprio quando configurado", () => {
    const config = lerConfig({
      ...comControlador,
      ZENTRADE_ENCARREGADO_NOME: "Bruno DPO",
      ZENTRADE_ENCARREGADO_EMAIL: "dpo@exemplo.com",
    });
    expect(configPublica(config, "1.2.3")).toEqual({
      controlador: { nome: "Ana Exemplo", email: "privacidade@exemplo.com" },
      encarregado: { nome: "Bruno DPO", email: "dpo@exemplo.com" },
      versao: "1.2.3",
    });
  });

  it("lê a versão do package.json da API e cai em 'desconhecida' sem arquivo", () => {
    expect(lerVersao()).toMatch(/^\d+\.\d+\.\d+/);
    expect(lerVersao(new URL("file:///caminho/que/nao/existe/package.json"))).toBe("desconhecida");
  });
});
