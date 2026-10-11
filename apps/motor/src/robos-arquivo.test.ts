import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { carregarRobos, robosDoJson } from "./robos-arquivo.js";

const exemplo = fileURLToPath(new URL("../robos.exemplo.json", import.meta.url));

describe("robôs do arquivo JSON (desenvolvimento)", () => {
  it("o exemplo do repositório é válido e vira RoboConfig com decimais exatos", async () => {
    const { robos, pausados } = await carregarRobos(exemplo, "papel");
    expect(robos).toHaveLength(1);
    const r = robos[0]!;
    expect(r.riscoPorOperacao.toFixed()).toBe("4");
    expect(r.limites.pausaAposPerdaMs).toBe(60 * 60_000);
    expect(r.limites.exposicaoMaxima.toFixed()).toBe("200");
    expect(r.estrategia.saida).toBeUndefined();
    expect(pausados).toEqual([]);
  });

  it("robô de outra rede é recusado (uma fonte só de preço)", () => {
    expect(() => robosDoJson(readFileSync(exemplo, "utf8"), "testnet")).toThrow(/rede "papel".*testnet/);
  });

  it("explica JSON torto, campo inválido, estratégia ruim, id repetido e rede real", () => {
    const base = JSON.parse(readFileSync(exemplo, "utf8")) as Record<string, unknown>[];
    const robo = base[0]!;
    expect(() => robosDoJson("{", "papel")).toThrow(/JSON/);
    expect(() => robosDoJson(JSON.stringify([{ ...robo, simbolo: "btc" }]), "papel")).toThrow(/simbolo/);
    expect(() => robosDoJson(JSON.stringify([robo, robo]), "papel")).toThrow(/repetido/);
    expect(() => robosDoJson(JSON.stringify([{ ...robo, rede: "real" }]), "papel")).toThrow(/real/);
    const periodoRuim = {
      ...robo,
      estrategia: {
        ...(robo.estrategia as object),
        entrada: {
          tipo: "comparar",
          esquerda: { tipo: "indicador", nome: "sma", periodo: 0 },
          comparador: "<",
          direita: { tipo: "numero", valor: 1 },
        },
      },
    };
    expect(() => robosDoJson(JSON.stringify([periodoRuim]), "papel")).toThrow(/estratégia/);
  });

  it("robô marcado como pausado entra na lista de pausados", () => {
    const base = JSON.parse(readFileSync(exemplo, "utf8")) as Record<string, unknown>[];
    expect(robosDoJson(JSON.stringify([{ ...base[0], pausado: true }]), "papel").pausados).toEqual([
      "exemplo-btc-15m",
    ]);
  });

  it("arquivo inexistente diz onde procurou", async () => {
    await expect(carregarRobos("/nao/existe.json", "papel")).rejects.toThrow(/\/nao\/existe\.json/);
  });
});
