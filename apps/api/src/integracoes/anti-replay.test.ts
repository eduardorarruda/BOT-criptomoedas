import { describe, expect, it, vi } from "vitest";
import { antiReplayMemoria, antiReplayRedis, PREFIXO_ASSINATURA_USADA } from "./anti-replay.js";

describe("anti-replay dos webhooks", () => {
  it("no Redis usa SET NX EX com o TTL pedido", async () => {
    const set = vi.fn(async () => "OK" as const);
    expect(await antiReplayRedis({ set }).primeiraVez("/x:abc", 301)).toBe(true);
    expect(set).toHaveBeenCalledWith(`${PREFIXO_ASSINATURA_USADA}/x:abc`, "1", "EX", 301, "NX");
    const jaUsada = vi.fn(async () => null);
    expect(await antiReplayRedis({ set: jaUsada }).primeiraVez("/x:abc", 301)).toBe(false);
  });

  it("em memória lembra até o TTL vencer", async () => {
    const relogio = { t: 0 };
    const guarda = antiReplayMemoria(() => relogio.t);
    expect(await guarda.primeiraVez("a", 2)).toBe(true);
    expect(await guarda.primeiraVez("a", 2)).toBe(false);
    relogio.t = 2001;
    expect(await guarda.primeiraVez("a", 2)).toBe(true);
    expect(await antiReplayMemoria().primeiraVez("b", 1)).toBe(true);
  });
});
