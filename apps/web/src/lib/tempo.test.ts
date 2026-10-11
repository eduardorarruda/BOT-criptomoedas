import { describe, expect, it } from "vitest";
import { formatarDataHora, formatarHora, formatarRelativo, formatarDuracao } from "./tempo";

// 10/10/2026 14:32:05 em São Paulo (UTC−3)
const EM = Date.UTC(2026, 9, 10, 17, 32, 5);

describe("tempo", () => {
  it("formata data e hora no fuso de São Paulo", () => {
    expect(formatarDataHora(EM)).toBe("10/10 14:32");
    expect(formatarHora(EM)).toBe("14:32:05");
  });

  it("descreve há quanto tempo, como uma pessoa diria", () => {
    expect(formatarRelativo(EM - 20_000, EM)).toBe("agora há pouco");
    expect(formatarRelativo(EM - 3 * 60_000, EM)).toBe("há 3 min");
    expect(formatarRelativo(EM - 2 * 3_600_000, EM)).toBe("há 2 h");
    expect(formatarRelativo(EM - 3 * 86_400_000, EM)).toBe("há 3 dias");
    expect(formatarRelativo(EM - 86_400_000, EM)).toBe("há 1 dia");
  });

  it("trata instantes no futuro como agora", () => {
    expect(formatarRelativo(EM + 5000, EM)).toBe("agora há pouco");
  });

  it("formata durações curtas", () => {
    expect(formatarDuracao(45_000)).toBe("45 s");
    expect(formatarDuracao(5 * 60_000)).toBe("5 min");
    expect(formatarDuracao(90 * 60_000)).toBe("1 h 30 min");
  });
});
