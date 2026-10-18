import { describe, expect, it } from "vitest";
import { meiaNoiteB3 } from "./comandos.js";
import { detectarFusoServidorMt5, horaDoServidor, paraUtcMt5 } from "./fuso-mt5.js";

const DIA = "2026-10-14";
// 09:00 de Brasília (UTC-3, sem horário de verão desde 2019) = 12:00 UTC no mesmo dia.
const ABERTURA_UTC = meiaNoiteB3(DIA) + 9 * 3_600_000;
const HORA = 3_600_000;

describe("horaDoServidor", () => {
  it("lê os dígitos como se já fossem UTC (o jeito que o MT5 devolve a hora)", () => {
    const h = horaDoServidor(Date.UTC(2026, 9, 14, 15, 30));
    expect(h).toMatchObject({ ano: 2026, mes: 10, dia: 14, hora: 15, minuto: 30 });
  });
});

describe("detectarFusoServidorMt5", () => {
  it("servidor em Brasília (deslocamento 0): a vela já chega em 09:00", () => {
    expect(detectarFusoServidorMt5(ABERTURA_UTC, DIA)).toEqual({ tipo: "fixo", minutos: 0 });
  });

  it("servidor adiantado (ex.: Europa, UTC+3): a vela chega marcando 12:00", () => {
    const naive = ABERTURA_UTC + 3 * HORA;
    expect(detectarFusoServidorMt5(naive, DIA)).toEqual({ tipo: "fixo", minutos: 180 });
  });

  it("servidor atrasado (ex.: EUA, UTC-5): a vela chega marcando 04:00", () => {
    const naive = ABERTURA_UTC - 5 * HORA;
    expect(detectarFusoServidorMt5(naive, DIA)).toEqual({ tipo: "fixo", minutos: -300 });
  });
});

describe("paraUtcMt5 (ida e volta com o fuso detectado)", () => {
  it.each([
    ["Brasília", 0],
    ["Europa (UTC+3)", 3 * 60],
    ["Oriente Médio (UTC+4)", 4 * 60],
    ["EUA (UTC-5)", -5 * 60],
  ] as const)(
    "%s: a vela detectada e convertida de volta bate com a abertura de verdade",
    (_nome, minutos) => {
      const naive = ABERTURA_UTC + minutos * 60_000;
      const fuso = detectarFusoServidorMt5(naive, DIA);
      expect(fuso).toEqual({ tipo: "fixo", minutos });
      expect(paraUtcMt5(naive, fuso)).toBe(ABERTURA_UTC);
    },
  );

  it("converte uma série inteira de velas de 5m do dia, não só a primeira", () => {
    const fuso = { tipo: "fixo", minutos: 180 } as const;
    const velasNaive = [0, 5, 10, 15].map((min) => ABERTURA_UTC + 3 * HORA + min * 60_000);
    const velasUtc = velasNaive.map((n) => paraUtcMt5(n, fuso));
    expect(velasUtc).toEqual([0, 5, 10, 15].map((min) => ABERTURA_UTC + min * 60_000));
  });
});
