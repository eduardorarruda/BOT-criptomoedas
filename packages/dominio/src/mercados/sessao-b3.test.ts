import { describe, expect, it } from "vitest";
import {
  chaveDiaB3,
  deveZerar,
  diaB3,
  horaB3,
  minutosDoHorario,
  podeAbrirNaSessao,
  problemasSessao,
  SESSAO_B3_PADRAO,
  type SessaoB3,
} from "./sessao-b3.js";

/** Instante UTC de um horário de Brasília (UTC−3 desde 2019). */
const brasilia = (dia: string, hhmm: string) => Date.parse(`${dia}T${hhmm}:00-03:00`);

describe("hora da B3 (America/Sao_Paulo)", () => {
  it("converte o instante UTC para o dia e os minutos do pregão", () => {
    expect(horaB3(brasilia("2026-10-16", "09:15"))).toEqual({ dia: "2026-10-16", minutos: 9 * 60 + 15 });
    // 01:30 UTC de 17/10 ainda é 16/10 em Brasília
    expect(horaB3(Date.UTC(2026, 9, 17, 1, 30))).toEqual({ dia: "2026-10-16", minutos: 22 * 60 + 30 });
    expect(diaB3(brasilia("2026-01-02", "18:15"))).toBe("2026-01-02");
    // a chave numérica do dia muda à meia-noite de Brasília, não à de UTC
    expect(chaveDiaB3(brasilia("2026-01-02", "23:59"))).toBe(chaveDiaB3(brasilia("2026-01-02", "00:00")));
    expect(chaveDiaB3(brasilia("2026-01-03", "00:00"))).toBe(chaveDiaB3(brasilia("2026-01-02", "00:00")) + 1);
  });

  it("respeita o horário de verão de antes de 2019 (UTC−2)", () => {
    // 4/11/2018: o relógio pulou de 00:00 para 01:00; 13:00 UTC = 11:00 local
    expect(horaB3(Date.UTC(2018, 10, 5, 13, 0))).toEqual({ dia: "2018-11-05", minutos: 11 * 60 });
    expect(horaB3(Date.UTC(2018, 6, 5, 13, 0))).toEqual({ dia: "2018-07-05", minutos: 10 * 60 });
  });

  it("horário HH:MM em minutos; recusa o que não é horário", () => {
    expect(minutosDoHorario("09:15")).toBe(555);
    expect(minutosDoHorario("18:15")).toBe(1095);
    expect(() => minutosDoHorario("9h15")).toThrow(RangeError);
    expect(() => minutosDoHorario("24:00")).toThrow(RangeError);
  });
});

describe("filtros de sessão", () => {
  const s = SESSAO_B3_PADRAO;
  const em = (hhmm: string) => brasilia("2026-10-16", hhmm);

  it("padrão: entradas das 09:15 às 17:30 e zeragem às 18:15", () => {
    expect(s).toEqual({
      inicioEntradas: "09:15",
      fimEntradas: "17:30",
      zeragem: "18:15",
      pularLeilaoAbertura: true,
    });
  });

  it("não abre antes do início nem depois do corte", () => {
    expect(podeAbrirNaSessao(em("09:10"), s, false)).toEqual({
      pode: false,
      motivo: "antes das 09:15, o início das entradas",
    });
    expect(podeAbrirNaSessao(em("09:15"), s, false).pode).toBe(true);
    expect(podeAbrirNaSessao(em("17:25"), s, false).pode).toBe(true);
    expect(podeAbrirNaSessao(em("17:30"), s, false)).toEqual({
      pode: false,
      motivo: "depois das 17:30, o corte das entradas",
    });
  });

  it("pula o candle do leilão de abertura (o primeiro do dia), se pedido", () => {
    expect(podeAbrirNaSessao(em("10:05"), s, true)).toEqual({
      pode: false,
      motivo: "primeiro candle do pregão (leilão de abertura)",
    });
    expect(podeAbrirNaSessao(em("10:05"), { ...s, pularLeilaoAbertura: false }, true).pode).toBe(true);
  });

  it("zera no fechamento do candle que termina na hora da zeragem ou depois", () => {
    expect(deveZerar(em("18:10"), s)).toBe(false);
    expect(deveZerar(em("18:15"), s)).toBe(true);
    expect(deveZerar(em("18:20"), s)).toBe(true);
  });

  it("valida a ordem dos horários", () => {
    expect(problemasSessao(s)).toEqual([]);
    const ruim: SessaoB3 = { ...s, inicioEntradas: "17:40" };
    expect(problemasSessao(ruim)).toContain("o início das entradas precisa ser antes do corte das entradas");
    expect(problemasSessao({ ...s, zeragem: "17:00" })).toContain(
      "a zeragem precisa ser no corte das entradas ou depois",
    );
    expect(problemasSessao({ ...s, fimEntradas: "25:00" })[0]).toMatch(/horário inválido/);
  });
});
