import { describe, expect, it } from "vitest";
import { lerArgumentosReplay } from "./argumentos.js";

describe("argumentos do replay", () => {
  it("o padrão é o experimento pré-registrado e NÃO confirma sozinho", () => {
    const a = lerArgumentosReplay([]);
    expect(a).toMatchObject({
      inicio: "2026-07-01",
      fim: "2026-10-20",
      maximo: 200,
      custoMaximoUsd: 15,
      confirmar: false,
      soRelatorio: false,
      inicioMs: Date.parse("2026-07-01T00:00:00Z"),
      fimMs: Date.parse("2026-10-21T00:00:00Z"),
    });
  });

  it("aceita as chaves e os valores", () => {
    const a = lerArgumentosReplay([
      "--maximo",
      "5",
      "--custo-maximo-usd",
      "1.5",
      "--confirmar",
      "--paralelo",
      "1",
    ]);
    expect(a).toMatchObject({ maximo: 5, custoMaximoUsd: 1.5, confirmar: true, paralelo: 1 });
  });

  it("recusa janela que começa antes do corte de conhecimento do modelo", () => {
    expect(() => lerArgumentosReplay(["--inicio", "2026-06-15"])).toThrow(/corte de conhecimento/);
    expect(() => lerArgumentosReplay(["--inicio", "2026-06-15", "--corte", "2026-06-01"])).not.toThrow();
  });

  it("recusa valor faltando, número ruim e data impossível", () => {
    expect(() => lerArgumentosReplay(["--maximo"])).toThrow(/precisa de um valor/);
    expect(() => lerArgumentosReplay(["--maximo", "0"])).toThrow(/--maximo/);
    expect(() => lerArgumentosReplay(["--inicio", "ontem"])).toThrow(/--inicio/);
    expect(() => lerArgumentosReplay(["--fim", "2026-06-30"])).toThrow(/depois de --inicio/);
  });
});
