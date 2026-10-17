import { describe, expect, it } from "vitest";
import { FUSO_B3, horaLocal, instanteLocal, lerFuso } from "./fuso.js";

const sp = lerFuso(FUSO_B3);

describe("fuso horário", () => {
  it("São Paulo é UTC−3 desde 2019 (sem horário de verão)", () => {
    const t = Date.UTC(2026, 6, 1, 13, 0);
    expect(horaLocal(t, sp)).toMatchObject({ ano: 2026, mes: 7, dia: 1, hora: 10, minuto: 0, diaSemana: 3 });
    expect(instanteLocal({ ano: 2026, mes: 7, dia: 1, hora: 10, minuto: 0 }, sp)).toBe(t);
  });

  it("antes de 2019 respeita o horário de verão de São Paulo (UTC−2)", () => {
    // 10 de dezembro de 2018, segunda-feira, em horário de verão.
    const t = Date.UTC(2018, 11, 10, 12, 0);
    expect(horaLocal(t, sp)).toMatchObject({ hora: 10, minuto: 0, diaSemana: 1 });
    expect(instanteLocal({ ano: 2018, mes: 12, dia: 10, hora: 10, minuto: 0 }, sp)).toBe(t);
    // Em julho de 2018 não havia horário de verão: UTC−3.
    expect(instanteLocal({ ano: 2018, mes: 7, dia: 2, hora: 10, minuto: 0 }, sp)).toBe(
      Date.UTC(2018, 6, 2, 13, 0),
    );
  });

  it("deslocamento fixo: '+02:00', '-03:00', 'UTC' e 'Z'", () => {
    const h = { ano: 2026, mes: 7, dia: 1, hora: 16, minuto: 0 };
    expect(instanteLocal(h, lerFuso("+02:00"))).toBe(Date.UTC(2026, 6, 1, 14, 0));
    expect(instanteLocal(h, lerFuso("-03:00"))).toBe(Date.UTC(2026, 6, 1, 19, 0));
    expect(instanteLocal(h, lerFuso("-03:30"))).toBe(Date.UTC(2026, 6, 1, 19, 30));
    expect(instanteLocal(h, lerFuso("UTC"))).toBe(Date.UTC(2026, 6, 1, 16, 0));
    expect(instanteLocal(h, lerFuso("Z"))).toBe(Date.UTC(2026, 6, 1, 16, 0));
    expect(horaLocal(Date.UTC(2026, 6, 1, 23, 30), lerFuso("+02:00"))).toMatchObject({
      dia: 2,
      hora: 1,
      minuto: 30,
      diaSemana: 4,
    });
  });

  it("fuso IANA de servidor de corretora (ex.: Europe/Athens, com horário de verão europeu)", () => {
    const atenas = lerFuso("Europe/Athens");
    // Julho: UTC+3 (verão europeu); janeiro: UTC+2.
    expect(instanteLocal({ ano: 2026, mes: 7, dia: 1, hora: 16, minuto: 0 }, atenas)).toBe(
      Date.UTC(2026, 6, 1, 13, 0),
    );
    expect(instanteLocal({ ano: 2026, mes: 1, dia: 5, hora: 15, minuto: 0 }, atenas)).toBe(
      Date.UTC(2026, 0, 5, 13, 0),
    );
  });

  it("recusa fuso desconhecido ou deslocamento mal escrito, explicando", () => {
    expect(() => lerFuso("Marte/Olympus")).toThrow(/fuso desconhecido/);
    expect(() => lerFuso("+3")).toThrow(/fuso desconhecido/);
    expect(() => lerFuso("+15:00")).toThrow(/fuso desconhecido/);
    expect(() => lerFuso("")).toThrow(/fuso desconhecido/);
  });

  it("segundos entram no instante", () => {
    expect(instanteLocal({ ano: 2026, mes: 7, dia: 1, hora: 10, minuto: 0, segundo: 30 }, sp)).toBe(
      Date.UTC(2026, 6, 1, 13, 0, 30),
    );
  });
});
