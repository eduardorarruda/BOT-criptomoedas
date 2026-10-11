import { describe, expect, it } from "vitest";
import {
  MudancaTituloEsquema,
  NovoTituloEsquema,
  PosicaoTituloEsquema,
  RegistrarItemEsquema,
  SimularIsentoEsquema,
} from "./esquemas.js";

const cdb = {
  tipo: "CDB",
  nome: "CDB Banco X 110%",
  emissor: "Banco X",
  indexador: "CDI",
  percentualIndexador: "110",
  dataAplicacao: "2026-01-15",
  vencimento: "2028-01-15",
  valorAplicado: "10000.00",
  liquidez: "vencimento",
};

const mensagens = (r: { success: boolean; error?: { issues: { message: string }[] } }) =>
  r.error?.issues.map((i) => i.message).join("; ") ?? "";

describe("cadastro manual de título", () => {
  it("aceita um CDB pós-fixado", () => {
    expect(NovoTituloEsquema.safeParse(cdb).success).toBe(true);
  });

  it("prefixado e IPCA+ exigem a taxa anual", () => {
    const r = NovoTituloEsquema.safeParse({ ...cdb, indexador: "PREFIXADO", percentualIndexador: null });
    expect(r.success).toBe(false);
    expect(mensagens(r)).toMatch(/taxa anual/);
  });

  it("vencimento antes da aplicação é recusado", () => {
    expect(mensagens(NovoTituloEsquema.safeParse({ ...cdb, vencimento: "2025-01-01" }))).toMatch(
      /vencimento/,
    );
  });

  it("carência exige a data", () => {
    expect(mensagens(NovoTituloEsquema.safeParse({ ...cdb, liquidez: "carencia" }))).toMatch(/carência/);
  });

  it("valor precisa ser positivo e decimal em texto", () => {
    expect(NovoTituloEsquema.safeParse({ ...cdb, valorAplicado: "0" }).success).toBe(false);
    expect(NovoTituloEsquema.safeParse({ ...cdb, valorAplicado: 10000 }).success).toBe(false);
    expect(NovoTituloEsquema.safeParse({ ...cdb, dataAplicacao: "15/01/2026" }).success).toBe(false);
  });

  it("mudança parcial aceita só o que mudou", () => {
    expect(MudancaTituloEsquema.safeParse({ nome: "Outro nome" }).success).toBe(true);
    expect(MudancaTituloEsquema.safeParse({ percentualIndexador: "5000" }).success).toBe(false);
  });
});

describe("posição", () => {
  it("indisponível traz o motivo", () => {
    expect(
      PosicaoTituloEsquema.safeParse({ disponivel: false, aplicado: "1", motivo: "faltam dados do CDI" })
        .success,
    ).toBe(true);
    expect(PosicaoTituloEsquema.safeParse({ disponivel: true, aplicado: "1" }).success).toBe(false);
  });
});

describe("Pluggy e simuladores", () => {
  it("Item ID é um UUID", () => {
    expect(RegistrarItemEsquema.safeParse({ itemId: "não" }).success).toBe(false);
    expect(RegistrarItemEsquema.safeParse({ itemId: "4b6a1a5e-8e0a-4c55-9f43-3b8f3c1d2e7a" }).success).toBe(
      true,
    );
  });

  it("simulador limita o prazo", () => {
    const base = { direcao: "isento_para_tributado", percentualCdi: "90", cdiAnual: "13.65" };
    expect(SimularIsentoEsquema.safeParse({ ...base, prazoDias: 365 }).success).toBe(true);
    expect(SimularIsentoEsquema.safeParse({ ...base, prazoDias: 0 }).success).toBe(false);
  });
});
