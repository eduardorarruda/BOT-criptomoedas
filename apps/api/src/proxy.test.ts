import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { confiancaNoProxy } from "./proxy.js";

async function ipVisto(confiavel: string, cabecalhos: Record<string, string>): Promise<string> {
  const app = Fastify({ trustProxy: confiancaNoProxy(confiavel) });
  app.get("/ip", async (req) => ({ ip: req.ip }));
  // 10.0.0.2 faz o papel do container do nginx na rede interna do Docker.
  const r = await app.inject({ method: "GET", url: "/ip", headers: cabecalhos, remoteAddress: "10.0.0.2" });
  await app.close();
  return (r.json() as { ip: string }).ip;
}

describe("IP de quem chama atrás do nginx", () => {
  it("sem proxy configurado, vale o endereço da conexão (cabeçalho ignorado)", async () => {
    expect(confiancaNoProxy("")).toBe(false);
    expect(confiancaNoProxy("  ")).toBe(false);
    expect(await ipVisto("", { "x-forwarded-for": "203.0.113.7" })).toBe("10.0.0.2");
  });

  it("com o nginx (rede privada) na frente, vale o endereço que ele informa", async () => {
    expect(await ipVisto("loopback,uniquelocal", { "x-forwarded-for": "203.0.113.7" })).toBe("203.0.113.7");
  });

  it("conexão direta de um endereço público não é proxy: o cabeçalho dela não vale", async () => {
    const app = Fastify({ trustProxy: confiancaNoProxy("loopback,uniquelocal") });
    app.get("/ip", async (req) => ({ ip: req.ip }));
    const r = await app.inject({
      method: "GET",
      url: "/ip",
      headers: { "x-forwarded-for": "6.6.6.6" },
      remoteAddress: "198.51.100.9",
    });
    await app.close();
    expect((r.json() as { ip: string }).ip).toBe("198.51.100.9");
  });
});
