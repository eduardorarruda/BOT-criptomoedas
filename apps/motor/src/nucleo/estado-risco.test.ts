import { dec } from "@zentrade/dominio";
import { describe, expect, it } from "vitest";
import { inicioDoDia, montarEstadoRisco } from "./estado-risco.js";
import { OPCOES_PADRAO, type Dependencias } from "./tipos.js";

/** 17/10/2026 22:52 em Brasília: já é 18/10 01:52 em UTC. */
const PRINT = Date.parse("2026-10-18T01:52:00Z");
/** A venda com perda: 17/10 20:00 em Brasília (23:00 UTC). */
const PERDA_EM = Date.parse("2026-10-17T23:00:00Z");

/** Só o que montarEstadoRisco lê: a perda de US$ 50 entra se o "dia" começou antes dela. */
function depsFalsas(agora: number, fuso: string): Dependencias {
  return {
    robos: { pausado: () => Promise.resolve(false) },
    ordens: {
      resultadoDesde: (_roboId: string, desde: number) => Promise.resolve(dec(desde <= PERDA_EM ? -50 : 0)),
      contarDesde: () => Promise.resolve(0),
      ultimaPerdaEm: () => Promise.resolve(PERDA_EM),
    },
    relogio: { agora: () => agora },
    opcoes: { ...OPCOES_PADRAO, fuso },
  } as unknown as Dependencias;
}

describe("o dia do risco do robô (perda diária)", () => {
  it("o padrão é o horário de Brasília", () => {
    expect(OPCOES_PADRAO.fuso).toBe("America/Sao_Paulo");
  });

  it("às 22:52 de Brasília o dia ainda é 17/10: começa às 03:00 UTC, não à meia-noite UTC", () => {
    expect(inicioDoDia(PRINT, "America/Sao_Paulo")).toBe(Date.parse("2026-10-17T03:00:00Z"));
  });

  it("a perda das 20h não some às 21h de Brasília", async () => {
    const e = await montarEstadoRisco(depsFalsas(PRINT, "America/Sao_Paulo"), "r1", dec(0));
    expect(e.resultadoDoDia.toFixed()).toBe("-50");
  });

  it("com o fuso em UTC volta o comportamento antigo (o dia virou às 00:00 UTC)", async () => {
    const e = await montarEstadoRisco(depsFalsas(PRINT, "UTC"), "r1", dec(0));
    expect(e.resultadoDoDia.toFixed()).toBe("0");
  });

  it("depois da meia-noite de Brasília o dia virou e a perda de ontem não conta", async () => {
    const meiaNoiteEMeia = Date.parse("2026-10-18T03:30:00Z");
    const e = await montarEstadoRisco(depsFalsas(meiaNoiteEMeia, "America/Sao_Paulo"), "r1", dec(0));
    expect(e.resultadoDoDia.toFixed()).toBe("0");
  });
});
