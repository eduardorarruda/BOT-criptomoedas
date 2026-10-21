import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
import { serieDeAlta } from "../teste/serie-replay.js";
import { candlesComCache } from "./cache-candles.js";

const pastas: string[] = [];
afterAll(async () => Promise.all(pastas.map((p) => rm(p, { recursive: true, force: true }))));

describe("cache de candles do replay", () => {
  it("baixa uma vez, depois lê do disco e devolve os mesmos candles", async () => {
    const pasta = await mkdtemp(join(tmpdir(), "replay-cache-"));
    pastas.push(pasta);
    const serie = serieDeAlta(Date.parse("2026-06-01T00:00:00Z"), 50);
    const baixar = vi.fn(async () => serie);
    const pedido = { pasta, simbolo: "BTCUSDT", intervalo: "1h", inicio: 1, fim: 2 };
    const primeira = await candlesComCache(pedido, baixar);
    const segunda = await candlesComCache(pedido, baixar);
    expect(baixar).toHaveBeenCalledTimes(1);
    expect(segunda).toHaveLength(50);
    expect(segunda.map((c) => [c.abertura, c.fecha.toString()])).toEqual(
      primeira.map((c) => [c.abertura, c.fecha.toString()]),
    );
    expect(segunda[7]?.maxima.eq(serie[7]?.maxima ?? 0)).toBe(true);
  });

  it("cache corrompido não passa em silêncio", async () => {
    const pasta = await mkdtemp(join(tmpdir(), "replay-cache-"));
    pastas.push(pasta);
    const { writeFile } = await import("node:fs/promises");
    await writeFile(join(pasta, "X-1h-1-2.json"), "{ quebrado");
    await expect(
      candlesComCache({ pasta, simbolo: "X", intervalo: "1h", inicio: 1, fim: 2 }, async () => []),
    ).rejects.toThrow();
  });
});
