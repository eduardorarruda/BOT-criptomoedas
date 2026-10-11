import type { Redis } from "ioredis";
import { describe, expect, it, vi } from "vitest";
import { verificadorSaude } from "./redis.js";

const log = { warn: vi.fn(), error: vi.fn() };

function redisFalso(o: { ping?: () => Promise<string>; batida?: string | null }): Redis {
  return {
    ping: o.ping ?? (async () => "PONG"),
    get: async () => o.batida ?? null,
  } as unknown as Redis;
}

describe("checagens de saúde", () => {
  it("Redis fora do ar responde false e registra o erro", async () => {
    const s = verificadorSaude({
      redis: redisFalso({ ping: () => Promise.reject(new Error("fora")) }),
      log,
      agora: () => 0,
    });
    expect(await s.redis()).toBe(false);
    expect(log.error).toHaveBeenCalled();
  });

  it("idade da batida do motor em segundos; sem batida, null", async () => {
    const agora = () => 100_000;
    expect(
      await verificadorSaude({ redis: redisFalso({ batida: "40000" }), log, agora }).motorVivoHaSegundos(),
    ).toBe(60);
    expect(await verificadorSaude({ redis: redisFalso({}), log, agora }).motorVivoHaSegundos()).toBeNull();
  });

  it("agente: null sem URL, true se responde, false se cai", async () => {
    const base = { redis: redisFalso({}), log, agora: () => 0 };
    expect(await verificadorSaude(base).agente()).toBeNull();
    const ok = vi.fn(async () => new Response("{}"));
    expect(await verificadorSaude({ ...base, agenteUrl: "http://agente:8081/", buscar: ok }).agente()).toBe(
      true,
    );
    expect(ok.mock.calls[0]).toContain("http://agente:8081/saude");
    const caiu = vi.fn(async () => Promise.reject(new Error("recusado")));
    expect(await verificadorSaude({ ...base, agenteUrl: "http://agente:8081", buscar: caiu }).agente()).toBe(
      false,
    );
  });
});
