import type { PontoIndicador } from "@zentrade/banco";
import type { SerieIndicador } from "@zentrade/contratos";
import { describe, expect, it } from "vitest";
import { carregarIndices, resumirIndicadores, type LeitorIndicadores } from "./bcb-indices.js";

const ipca12 = Array.from({ length: 13 }, (_, i) => ({
  dia: `${i < 4 ? 2025 : 2026}-${String(((i + 8) % 12) + 1).padStart(2, "0")}-01`,
  valor: "0.5",
}));

const dados: Partial<Record<SerieIndicador, PontoIndicador[]>> = {
  CDI: [
    { dia: "2026-10-08", valor: "0.050788" },
    { dia: "2026-10-09", valor: "0.050788" },
  ],
  SELIC_META: [
    { dia: "2026-10-09", valor: "13.75" },
    { dia: "2026-11-02", valor: "13.75" },
  ],
  IPCA: ipca12,
  POUPANCA: [{ dia: "2026-10-01", valor: "0.6698", diaFim: "2026-11-01" }],
};

const leitor: LeitorIndicadores = {
  ler: async (serie, desde) => (dados[serie] ?? []).filter((p) => !desde || p.dia >= desde),
  estado: async () => [{ serie: "CDI", verificadoEm: 1, ultimoDia: "2026-10-09", erro: null }],
};

describe("índices a partir do cache", () => {
  it("monta os mapas que as contas usam (IPCA por mês)", async () => {
    const i = await carregarIndices(leitor, "2026-10-01");
    expect(i.cdi.get("2026-10-09")?.toFixed()).toBe("0.050788");
    expect(i.ipca.get("2026-09")?.toFixed()).toBe("0.5");
    expect(i.poupanca.size).toBe(1);
    expect(i.selic.size).toBe(0);
  });

  it("resume cada série com valor, data, anualizado e situação", async () => {
    const r = await resumirIndicadores(leitor, "2026-10-11");
    expect(r.fonte).toMatch(/Banco Central/);
    const por = Object.fromEntries(r.series.map((s) => [s.serie, s]));
    expect(por.CDI).toMatchObject({
      codigoSgs: 12,
      ultimoDia: "2026-10-09",
      ultimoValor: "0.050788",
      verificadoEm: 1,
    });
    expect(Number(por.CDI!.anualizado)).toBeCloseTo(13.65, 2);
    expect(por.SELIC_META).toMatchObject({ ultimoDia: "2026-10-09", anualizado: "13.75" });
    expect(por.IPCA!.anualizado).toBe("6.1678");
    expect(por.SELIC).toMatchObject({
      ultimoDia: null,
      ultimoValor: null,
      anualizado: null,
      verificadoEm: null,
    });
    expect(por.POUPANCA!.anualizado).toBeNull();
  });
});
