import { describe, expect, it } from "vitest";
import {
  chaveDiaNoFuso,
  descreverAgora,
  diaNoFuso,
  exigirFuso,
  formatarDataNoFuso,
  FUSO_PADRAO,
  fusoValido,
  horaNoFuso,
  inicioDoDiaDaData,
  inicioDoDiaNoFuso,
  inicioDoMesNoFuso,
  inicioDoProximoDiaNoFuso,
  inicioDoProximoMesNoFuso,
  mesNoFuso,
  nomeDoFuso,
} from "./fuso.js";

const SP = "America/Sao_Paulo";
const NY = "America/New_York";
const HORA = 3_600_000;

/** 17/10/2026 22:52 em Brasília (o print do usuário): já é 18/10 01:52 em UTC. */
const PRINT = Date.parse("2026-10-18T01:52:00Z");

describe("fuso da instância", () => {
  it("o padrão é o horário de Brasília", () => {
    expect(FUSO_PADRAO).toBe("America/Sao_Paulo");
  });

  it("aceita nomes IANA e UTC, devolvendo o nome canônico", () => {
    expect(fusoValido(SP)).toBe(true);
    expect(fusoValido("UTC")).toBe(true);
    expect(exigirFuso("america/sao_paulo")).toBe(SP);
    expect(exigirFuso(" Europe/Lisbon ")).toBe("Europe/Lisbon");
  });

  it("recusa fuso inválido com uma mensagem clara", () => {
    for (const ruim of ["", "Brasil", "Foo/Bar", "EST", "+03:00", "-3", "America/Sao Paulo"]) {
      expect(fusoValido(ruim)).toBe(false);
      expect(() => exigirFuso(ruim)).toThrow(/fuso desconhecido.*America\/Sao_Paulo/);
    }
  });
});

describe("o dia no fuso (não o dia UTC)", () => {
  it("22:52 de 17/10 em Brasília ainda é 17/10, que começou às 03:00 UTC", () => {
    expect(diaNoFuso(PRINT, SP)).toBe("2026-10-17");
    expect(inicioDoDiaNoFuso(PRINT, SP)).toBe(Date.parse("2026-10-17T03:00:00Z"));
    expect(inicioDoProximoDiaNoFuso(PRINT, SP)).toBe(Date.parse("2026-10-18T03:00:00Z"));
    expect(horaNoFuso(PRINT, SP)).toMatchObject({ dia: "2026-10-17", hora: 22, minuto: 52, diaSemana: 6 });
  });

  it("00:30 de Brasília já é o dia novo, que começou meia hora antes", () => {
    const t = Date.parse("2026-10-18T03:30:00Z");
    expect(diaNoFuso(t, SP)).toBe("2026-10-18");
    expect(inicioDoDiaNoFuso(t, SP)).toBe(Date.parse("2026-10-18T03:00:00Z"));
    expect(horaNoFuso(t, SP).minutos).toBe(30);
  });

  it("a virada exata: 23:59:59.999 é ontem, 00:00 é hoje", () => {
    const meiaNoite = Date.parse("2026-10-18T03:00:00Z");
    expect(diaNoFuso(meiaNoite - 1, SP)).toBe("2026-10-17");
    expect(diaNoFuso(meiaNoite, SP)).toBe("2026-10-18");
    expect(chaveDiaNoFuso(meiaNoite, SP) - chaveDiaNoFuso(meiaNoite - 1, SP)).toBe(1);
  });

  it("em UTC continua como antes", () => {
    expect(diaNoFuso(PRINT, "UTC")).toBe("2026-10-18");
    expect(inicioDoDiaNoFuso(PRINT, "UTC")).toBe(Date.parse("2026-10-18T00:00:00Z"));
  });

  it("o início de uma data escrita (filtros por data)", () => {
    expect(inicioDoDiaDaData("2026-10-01", SP)).toBe(Date.parse("2026-10-01T03:00:00Z"));
    expect(() => inicioDoDiaDaData("2026-02-31", SP)).toThrow(/data inválida/);
  });
});

describe("horário de verão (dias de 23 e 25 horas) em New York", () => {
  it("8/3/2026 tem 23 horas: começa às 05:00Z (EST) e o seguinte às 04:00Z (EDT)", () => {
    const meioDia = Date.parse("2026-03-08T16:00:00Z");
    const inicio = inicioDoDiaNoFuso(meioDia, NY);
    const fim = inicioDoProximoDiaNoFuso(meioDia, NY);
    expect(inicio).toBe(Date.parse("2026-03-08T05:00:00Z"));
    expect(fim).toBe(Date.parse("2026-03-09T04:00:00Z"));
    expect((fim - inicio) / HORA).toBe(23);
    // 01:59 EST → 03:00 EDT: 03:30 locais são 07:30Z
    expect(horaNoFuso(Date.parse("2026-03-08T07:30:00Z"), NY)).toMatchObject({ hora: 3, minuto: 30 });
  });

  it("1/11/2026 tem 25 horas: a 01:xx se repete e o dia não muda", () => {
    const meioDia = Date.parse("2026-11-01T17:00:00Z");
    const inicio = inicioDoDiaNoFuso(meioDia, NY);
    const fim = inicioDoProximoDiaNoFuso(meioDia, NY);
    expect(inicio).toBe(Date.parse("2026-11-01T04:00:00Z"));
    expect(fim).toBe(Date.parse("2026-11-02T05:00:00Z"));
    expect((fim - inicio) / HORA).toBe(25);
    expect(diaNoFuso(Date.parse("2026-11-01T05:30:00Z"), NY)).toBe("2026-11-01");
    expect(diaNoFuso(Date.parse("2026-11-01T06:30:00Z"), NY)).toBe("2026-11-01");
  });

  it("Brasil antes de 2019: a meia-noite que não existia (4/11/2018) começa à 01:00", () => {
    const t = Date.parse("2018-11-04T15:00:00Z");
    expect(inicioDoDiaNoFuso(t, SP)).toBe(Date.parse("2018-11-04T03:00:00Z"));
    expect(horaNoFuso(Date.parse("2018-11-04T03:00:00Z"), SP)).toMatchObject({ hora: 1, minuto: 0 });
    // e a volta (17/2/2019): 23:xx de 16/2 se repetiu; 17/2 começa às 03:00Z
    expect(inicioDoDiaNoFuso(Date.parse("2019-02-17T12:00:00Z"), SP)).toBe(
      Date.parse("2019-02-17T03:00:00Z"),
    );
  });

  it("fuso de meia hora (Índia) também", () => {
    expect(inicioDoDiaNoFuso(Date.parse("2026-10-17T20:00:00Z"), "Asia/Kolkata")).toBe(
      Date.parse("2026-10-17T18:30:00Z"),
    );
  });
});

describe("o mês no fuso", () => {
  it("21h do último dia do mês em Brasília ainda é o mês corrente", () => {
    const t = Date.parse("2026-11-01T00:30:00Z"); // 31/10 21:30 em Brasília
    expect(mesNoFuso(t, SP)).toBe("2026-10");
    expect(inicioDoMesNoFuso(t, SP)).toBe(Date.parse("2026-10-01T03:00:00Z"));
    expect(inicioDoProximoMesNoFuso(t, SP)).toBe(Date.parse("2026-11-01T03:00:00Z"));
  });

  it("dezembro vira janeiro do ano seguinte", () => {
    const t = Date.parse("2026-12-15T12:00:00Z");
    expect(inicioDoProximoMesNoFuso(t, SP)).toBe(Date.parse("2027-01-01T03:00:00Z"));
  });
});

describe("textos com o fuso", () => {
  it("o agora para o assistente: hora local, o fuso e o UTC", () => {
    expect(descreverAgora(PRINT, SP)).toBe(
      "sábado, 17/10/2026 22:52 (America/Sao_Paulo; UTC 2026-10-18T01:52Z)",
    );
  });

  it("datas no fuso", () => {
    expect(formatarDataNoFuso(PRINT, SP)).toBe("17/10/2026");
    expect(formatarDataNoFuso(PRINT, SP, { curta: true })).toBe("17/10");
  });

  it("o nome para gente: horário de Brasília", () => {
    expect(nomeDoFuso(SP)).toBe("horário de Brasília");
    expect(nomeDoFuso("UTC")).toBe("UTC");
    expect(nomeDoFuso(NY)).toMatch(/^horário/);
  });
});
