import { describe, expect, it } from "vitest";
import { meiaNoiteB3 } from "./comandos.js";
import { lerFuso } from "./fuso.js";
import { converterBarrasMt5, detectarFusoServidorMt5, horaDoServidor, paraUtcMt5 } from "./fuso-mt5.js";

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

describe("converterBarrasMt5", () => {
  const abre = (dia: string, deslocamentoMin: number, minutos = 0) =>
    meiaNoiteB3(dia) + 9 * HORA + deslocamentoMin * 60_000 + minutos * 60_000;

  it("com fuso configurado, usa-o (IANA acompanha o horário de verão do servidor)", () => {
    const fuso = lerFuso("Europe/Athens");
    const verao = Date.UTC(2026, 6, 1, 15, 0); // 15:00 do servidor em julho = 12:00 UTC (UTC+3)
    const inverno = Date.UTC(2026, 0, 14, 14, 0); // 14:00 em janeiro = 12:00 UTC (UTC+2)
    expect(converterBarrasMt5([verao, inverno], fuso)).toEqual([
      Date.UTC(2026, 6, 1, 12, 0),
      Date.UTC(2026, 0, 14, 12, 0),
    ]);
  });

  it("sem fuso, detecta dia a dia: a troca de horário de verão do servidor no meio não estraga", () => {
    const naives = [
      abre("2026-03-20", 120), // servidor em UTC+2 (inverno)
      abre("2026-03-20", 120, 5),
      abre("2026-03-31", 180), // depois da troca, UTC+3
      abre("2026-03-31", 180, 5),
    ];
    expect(converterBarrasMt5(naives, null)).toEqual([
      abre("2026-03-20", 0),
      abre("2026-03-20", 0, 5),
      abre("2026-03-31", 0),
      abre("2026-03-31", 0, 5),
    ]);
  });

  it("abertura que só pega negócio às 09:05 não desloca o dia (arredonda para meia hora)", () => {
    const naives = [abre("2026-10-15", 180, 5), abre("2026-10-15", 180, 10)];
    expect(converterBarrasMt5(naives, null)).toEqual([abre("2026-10-15", 0, 5), abre("2026-10-15", 0, 10)]);
  });
});
