import type { LimitesRiscoDTO, OrdemDTO } from "@zentrade/contratos/esquemas";
import { describe, expect, it } from "vitest";
import { inicioDoDia, medidores, ordensDesde, resultadoDesde } from "./risco";

/** 11/10/2026 00:00 em Brasília (03:00 UTC): o começo do dia do motor. */
const DIA = Date.parse("2026-10-11T03:00:00Z");
const HORA = 3_600_000;
const ordem = (
  lado: OrdemDTO["lado"],
  preco: string,
  em: number,
  quantidade = "1",
  taxa = "0.1",
): OrdemDTO => ({
  id: `${lado}-${em}`,
  decisaoId: "d",
  idCliente: "zt",
  simbolo: "BTCUSDT",
  lado,
  quantidade,
  estado: "PREENCHIDA",
  criadaEm: em,
  execucoes: [{ preco, quantidade, taxaCotacao: taxa, em }],
});
const LIMITES: LimitesRiscoDTO = {
  perdaDiariaMaxima: "10",
  exposicaoMaxima: "200",
  riscoPorOperacao: "1",
  ordensPorHoraMax: 4,
  pausaAposPerdaMin: 0,
  confiancaMinima: 0.5,
};

describe("medidores de risco", () => {
  it("o dia começa à meia-noite do fuso da instância, como no motor (não às 21h de Brasília)", () => {
    expect(inicioDoDia(DIA + 5 * HORA, "America/Sao_Paulo")).toBe(DIA);
    // 22:52 de 17/10 em Brasília já é 18/10 em UTC, mas o dia ainda é 17/10
    expect(inicioDoDia(Date.parse("2026-10-18T01:52:00Z"), "America/Sao_Paulo")).toBe(
      Date.parse("2026-10-17T03:00:00Z"),
    );
  });

  it("a perda das 20h ainda pesa às 22:52 de Brasília", () => {
    const noite = Date.parse("2026-10-18T01:52:00Z");
    const ordens = [
      ordem("COMPRA", "100", Date.parse("2026-10-17T13:00:00Z"), "1", "0"),
      ordem("VENDA", "95", Date.parse("2026-10-17T23:00:00Z"), "1", "0"),
    ];
    const [perda] = medidores({ limites: LIMITES, ordens, quantidade: "0", preco: null, agora: noite });
    expect(perda?.valor).toBe("5.00");
  });

  it("resultado realizado conta só o que aconteceu desde o início do dia, com as taxas", () => {
    const ordens = [
      ordem("COMPRA", "100", DIA - HORA), // ontem: compra (taxa de ontem não conta)
      ordem("VENDA", "92", DIA + HORA), // hoje: −8 − 0,1
      ordem("COMPRA", "90", DIA + 2 * HORA), // hoje: −0,1
    ];
    expect(resultadoDesde(ordens, DIA)?.toFixed(2)).toBe("-8.20");
    expect(resultadoDesde([ordem("VENDA", "1", DIA)], DIA)).toBeNull(); // venda sem posição
  });

  it("perda, exposição e ordens por hora contra os limites, com nível de atenção", () => {
    const agora = DIA + 3 * HORA;
    const ordens = [
      ordem("COMPRA", "100", DIA - HORA),
      ordem("VENDA", "92", DIA + HORA),
      ordem("COMPRA", "90", agora - 30 * 60_000, "1.5"),
      ordem("COMPRA", "90", agora - 10 * 60_000, "0.5"),
    ];
    const [perda, exposicao, porHora] = medidores({
      limites: LIMITES,
      ordens,
      quantidade: "2",
      preco: "90",
      agora,
    });
    expect(perda).toMatchObject({ valor: "8.30", nivel: "atencao" });
    expect(perda?.fracao).toBeCloseTo(0.83);
    expect(exposicao).toMatchObject({ valor: "180.00", limite: "200", nivel: "atencao" });
    expect(porHora).toMatchObject({ valor: "2", limite: "4", nivel: "ok", fracao: 0.5 });
    expect(ordensDesde(ordens, agora - HORA)).toBe(2);
  });

  it("no limite corta em 100%; sem preço não há exposição; ganho não é perda", () => {
    const agora = DIA + 3 * HORA;
    const ordens = [ordem("COMPRA", "100", DIA + HORA), ordem("VENDA", "120", DIA + 2 * HORA)];
    const m = medidores({
      limites: { ...LIMITES, ordensPorHoraMax: 1 },
      ordens,
      quantidade: "0",
      preco: null,
      agora,
    });
    expect(m[0]).toMatchObject({ valor: "0.00", nivel: "ok", fracao: 0 });
    expect(m[1]).toMatchObject({ valor: "0.00", fracao: 0 });
    expect(m[2]).toMatchObject({ nivel: "limite", fracao: 1 });
    const zero = medidores({
      limites: { ...LIMITES, exposicaoMaxima: "0" },
      ordens: [],
      quantidade: "1",
      preco: "5",
      agora,
    });
    expect(zero[1]).toMatchObject({ nivel: "limite", fracao: 1 });
    const ruim = medidores({
      limites: LIMITES,
      ordens: [ordem("VENDA", "1", DIA)],
      quantidade: "0",
      preco: "1",
      agora,
    });
    expect(ruim[0]?.valor).toBeNull();
  });
});
