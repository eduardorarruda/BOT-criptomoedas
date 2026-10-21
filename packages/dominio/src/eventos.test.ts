import { describe, expect, it } from "vitest";
import {
  eventoDeAltoImpactoNoInstante,
  fatorDoModoDeEvento,
  foiReduzidaPorEvento,
  fusoDoMercado,
  textoReducaoPorEvento,
  type EventoMercado,
} from "./eventos.js";

const evento = (o: Partial<EventoMercado> = {}): EventoMercado => ({
  data: "2026-10-28",
  mercado: "win",
  titulo: "Copom — decisão da Selic",
  impacto: "alto",
  ...o,
});

// 2026-10-28 12:00 em Brasília (UTC-3) = 15:00 UTC
const MEIO_DIA_BRASILIA = Date.UTC(2026, 9, 28, 15, 0);

describe("fuso do mercado", () => {
  it("o WIN é sempre o fuso da B3; a cripto usa o da instância", () => {
    expect(fusoDoMercado("win", "UTC")).toBe("America/Sao_Paulo");
    expect(fusoDoMercado("cripto", "UTC")).toBe("UTC");
  });
});

describe("eventoDeAltoImpactoNoInstante", () => {
  it("acha o evento do dia para o mercado do robô, de alto impacto", () => {
    const r = eventoDeAltoImpactoNoInstante([evento()], "win", MEIO_DIA_BRASILIA, "UTC");
    expect(r?.titulo).toBe("Copom — decisão da Selic");
  });

  it("ignora impacto médio, outro mercado e outro dia; 'todos' vale para qualquer mercado", () => {
    expect(
      eventoDeAltoImpactoNoInstante([evento({ impacto: "medio" })], "win", MEIO_DIA_BRASILIA, "UTC"),
    ).toBeNull();
    expect(
      eventoDeAltoImpactoNoInstante([evento({ mercado: "cripto" })], "win", MEIO_DIA_BRASILIA, "UTC"),
    ).toBeNull();
    expect(
      eventoDeAltoImpactoNoInstante([evento({ data: "2026-10-29" })], "win", MEIO_DIA_BRASILIA, "UTC"),
    ).toBeNull();
    expect(
      eventoDeAltoImpactoNoInstante([evento({ mercado: "todos" })], "cripto", MEIO_DIA_BRASILIA, "UTC"),
    ).not.toBeNull();
  });

  it("o dia é o do fuso do mercado: 23h de Brasília ainda é o dia do evento do WIN, mesmo já sendo o dia seguinte em UTC", () => {
    const noite = Date.UTC(2026, 9, 29, 2, 0); // 28/10 23:00 em Brasília
    expect(eventoDeAltoImpactoNoInstante([evento()], "win", noite, "UTC")).not.toBeNull();
    // para a cripto numa instância em UTC, o mesmo instante já é 29/10
    expect(eventoDeAltoImpactoNoInstante([evento({ mercado: "cripto" })], "cripto", noite, "UTC")).toBeNull();
    expect(
      eventoDeAltoImpactoNoInstante(
        [evento({ mercado: "cripto", data: "2026-10-29" })],
        "cripto",
        noite,
        "UTC",
      ),
    ).not.toBeNull();
  });

  it("com janela de horário, só vale dentro dela (no fuso do mercado)", () => {
    const janela = evento({ de: "14:00", ate: "15:00" });
    expect(eventoDeAltoImpactoNoInstante([janela], "win", MEIO_DIA_BRASILIA, "UTC")).toBeNull();
    const as1430 = Date.UTC(2026, 9, 28, 17, 30);
    expect(eventoDeAltoImpactoNoInstante([janela], "win", as1430, "UTC")).not.toBeNull();
    const as15 = Date.UTC(2026, 9, 28, 18, 0);
    expect(eventoDeAltoImpactoNoInstante([janela], "win", as15, "UTC")).not.toBeNull();
    const as1501 = Date.UTC(2026, 9, 28, 18, 1);
    expect(eventoDeAltoImpactoNoInstante([janela], "win", as1501, "UTC")).toBeNull();
  });
});

describe("fatorDoModoDeEvento", () => {
  it("reduzir pela metade; os outros modos não mexem no tamanho", () => {
    expect(fatorDoModoDeEvento("reduzir")).toBe(0.5);
    expect(fatorDoModoDeEvento("ignorar")).toBe(1);
    expect(fatorDoModoDeEvento("bloquear")).toBe(1);
  });
});

describe("marca de entrada reduzida", () => {
  it("o texto acrescentado é reconhecido e cita o evento", () => {
    const t = textoReducaoPorEvento("Payroll (EUA)");
    expect(t).toContain("dia de evento: Payroll (EUA)");
    expect(foiReduzidaPorEvento(`Preço abaixo de 95 ${t}`)).toBe(true);
    expect(foiReduzidaPorEvento("Preço abaixo de 95")).toBe(false);
  });
});
