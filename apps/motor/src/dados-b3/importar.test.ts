import { dec } from "@zentrade/dominio";
import { describe, expect, it } from "vitest";
import { bancoDeCandlesFalso } from "../teste/banco-candles.js";
import { aberturaSemente, sementeWinIbov5m } from "../teste/win-ibov.js";
import { gravarCandlesB3, substituirCandlesB3 } from "./importar.js";

const M5 = 300_000;
const DEPOIS = Date.UTC(2026, 7, 1);

describe("gravação de candles da B3", () => {
  it("a semente: 3 pregões de 84 candles, das 10:00 às 16:55 de Brasília", () => {
    const s = sementeWinIbov5m();
    expect(s).toHaveLength(252);
    expect(s[0]?.abertura).toBe(Date.UTC(2026, 6, 1, 13, 0));
    expect(s[83]?.abertura).toBe(Date.UTC(2026, 6, 1, 19, 55));
    expect(s.every((k) => k.maxima.gte(k.abre) && k.minima.lte(k.fecha))).toBe(true);
    expect(sementeWinIbov5m()).toEqual(s);
  });

  it("grava os 5m e monta 15m e 1h a partir do que ficou no banco", async () => {
    const b = bancoDeCandlesFalso();
    const r = await gravarCandlesB3(b.banco, "WIN-IBOV", "5m", sementeWinIbov5m(), { agora: DEPOIS });
    expect(r.gravados).toEqual({ "5m": 252, "15m": 84, "1h": 21 });
    expect(b.de("WIN-IBOV", "1h")).toHaveLength(21);
    const [primeiraHora] = b.de("WIN-IBOV", "1h");
    const doze = sementeWinIbov5m().slice(0, 12);
    expect(primeiraHora?.abertura).toBe(aberturaSemente(0, 0));
    expect(primeiraHora?.abre.equals(doze[0]!.abre)).toBe(true);
    expect(primeiraHora?.fecha.equals(doze[11]!.fecha)).toBe(true);
    expect(r.primeiro).toBe(aberturaSemente(0, 0));
    expect(r.ultimo).toBe(aberturaSemente(2, 83));
  });

  it("é idempotente: importar de novo não duplica nem muda nada", async () => {
    const b = bancoDeCandlesFalso();
    await gravarCandlesB3(b.banco, "WIN-IBOV", "5m", sementeWinIbov5m(), { agora: DEPOIS });
    const antes = { total: b.total(), horas: b.de("WIN-IBOV", "1h") };
    await gravarCandlesB3(b.banco, "WIN-IBOV", "5m", sementeWinIbov5m(), { agora: DEPOIS });
    expect(b.total()).toBe(antes.total);
    expect(b.de("WIN-IBOV", "1h")).toEqual(antes.horas);
  });

  it("importação parcial depois não estraga a hora já completa no banco", async () => {
    const b = bancoDeCandlesFalso();
    await gravarCandlesB3(b.banco, "WIN-IBOV", "5m", sementeWinIbov5m(), { agora: DEPOIS });
    const hora = b.de("WIN-IBOV", "1h")[0];
    // Só a segunda metade da primeira hora, com o último candle corrigido.
    const metade = sementeWinIbov5m()
      .slice(6, 12)
      .map((k, i) => (i === 5 ? { ...k, fecha: dec(1), minima: dec(1) } : k));
    await gravarCandlesB3(b.banco, "WIN-IBOV", "5m", metade, { agora: DEPOIS });
    const depois = b.de("WIN-IBOV", "1h")[0];
    expect(depois?.abre.equals(hora!.abre)).toBe(true);
    expect(depois?.fecha.toString()).toBe("1");
    expect(depois?.volume.equals(hora!.volume)).toBe(true);
  });

  it("descarta o que está fora do pregão e o candle ainda em formação", async () => {
    const b = bancoDeCandlesFalso();
    const s = sementeWinIbov5m().slice(0, 12);
    const noturno = { ...s[0]!, abertura: Date.UTC(2026, 6, 1, 21, 30), fechamento: 0 };
    const sabado = { ...s[0]!, abertura: Date.UTC(2026, 6, 4, 13, 0) };
    const agora = s[10]!.abertura + 2 * 60_000; // o 11º candle ainda está aberto
    const r = await gravarCandlesB3(b.banco, "WIN", "5m", [...s, noturno, sabado], { agora });
    expect(r.foraDoPregao).toBe(2);
    expect(r.emFormacao).toBe(2);
    expect(r.gravados["5m"]).toBe(10);
    expect(b.de("WIN", "5m").at(-1)?.fechamento).toBe(s[9]!.abertura + M5 - 1);
    // A hora (e o último quarto de hora) ainda não fecharam: não são gravadas.
    expect(b.de("WIN", "1h")).toHaveLength(0);
    expect(b.de("WIN", "15m")).toHaveLength(3);
  });

  it("fechamento sempre igual a abertura + intervalo − 1, mesmo que a fonte diga outro", async () => {
    const b = bancoDeCandlesFalso();
    const [k] = sementeWinIbov5m();
    await gravarCandlesB3(b.banco, "WIN", "5m", [{ ...k!, fechamento: 42 }], { agora: DEPOIS });
    expect(b.de("WIN", "5m")[0]?.fechamento).toBe(k!.abertura + M5 - 1);
  });

  it("15m importado direto monta só o 1h; 1h não monta nada", async () => {
    const b = bancoDeCandlesFalso();
    const quinzes = sementeWinIbov5m()
      .filter((_, i) => i % 3 === 0)
      .map((k) => ({ ...k, fechamento: k.abertura + 3 * M5 - 1 }));
    const r = await gravarCandlesB3(b.banco, "WIN", "15m", quinzes, { agora: DEPOIS });
    expect(r.gravados).toEqual({ "15m": 84, "1h": 21 });
    const r1h = await gravarCandlesB3(b.banco, "WIN", "1h", b.de("WIN", "1h"), { agora: DEPOIS });
    expect(r1h.gravados).toEqual({ "1h": 21 });
  });

  it("lista vazia não grava nada", async () => {
    const b = bancoDeCandlesFalso();
    const r = await gravarCandlesB3(b.banco, "WIN", "5m", [], { agora: DEPOIS });
    expect(r).toEqual({ gravados: { "5m": 0 }, foraDoPregao: 0, emFormacao: 0 });
    expect(b.gravacoes).toEqual([]);
  });

  it("grava em lotes de no máximo 1000", async () => {
    const b = bancoDeCandlesFalso();
    const muitos = Array.from({ length: 30 }, (_, d) => d)
      .filter((d) => ![0, 6].includes(new Date(Date.UTC(2026, 6, 1 + d)).getUTCDay()))
      .flatMap((d) =>
        sementeWinIbov5m()
          .slice(0, 84)
          .map((k) => ({ ...k, abertura: k.abertura + d * 86_400_000 })),
      );
    const r = await gravarCandlesB3(b.banco, "WIN-IBOV", "5m", muitos, { agora: Date.UTC(2026, 8, 1) });
    expect(r.gravados["5m"]).toBe(22 * 84);
    expect(b.gravacoes.filter((g) => g.intervalo === "5m").map((g) => g.quantos)).toEqual([1000, 848]);
  });
});

describe("substituição de um trecho (um pregão inteiro)", () => {
  const dia = (d: number) => ({ inicio: Date.UTC(2026, 6, d, 3), fim: Date.UTC(2026, 6, d + 1, 3) });

  it("apaga 5m, 15m e 1h do trecho antes de gravar: candle que sumiu da fonte não fica", async () => {
    const b = bancoDeCandlesFalso();
    await gravarCandlesB3(b.banco, "WIN", "5m", sementeWinIbov5m(), { agora: DEPOIS });
    const primeiroDia = sementeWinIbov5m().slice(0, 84);
    const r = await substituirCandlesB3(b.banco, "WIN", "5m", dia(1), primeiroDia.slice(12), {
      agora: DEPOIS,
    });
    expect(r.apagados).toBe(84 + 28 + 7);
    expect(r.gravados).toEqual({ "5m": 72, "15m": 24, "1h": 6 });
    // O dia 1 perdeu a primeira hora; os dias 2 e 3 ficaram como estavam.
    expect(b.de("WIN", "5m")).toHaveLength(72 + 168);
    expect(b.de("WIN", "1h")).toHaveLength(6 + 14);
    expect(b.de("WIN", "5m")[0]?.abertura).toBe(aberturaSemente(0, 12));
  });

  it("tudo vai numa chamada só ao banco (uma transação): nada de apagar e gravar em separado", async () => {
    const b = bancoDeCandlesFalso();
    await substituirCandlesB3(b.banco, "WIN", "5m", dia(1), sementeWinIbov5m().slice(0, 84), {
      agora: DEPOIS,
    });
    expect(b.substituicoes).toEqual([{ simbolo: "WIN", ...dia(1) }]);
    expect(b.gravacoes).toEqual([]);
  });

  it("deixa de fora o que está fora do pregão ou ainda em formação, como a gravação comum", async () => {
    const b = bancoDeCandlesFalso();
    const s = sementeWinIbov5m().slice(0, 12);
    const noturno = { ...s[0]!, abertura: Date.UTC(2026, 6, 1, 21, 30) };
    const r = await substituirCandlesB3(b.banco, "WIN", "5m", dia(1), [...s, noturno], {
      agora: s[10]!.abertura + 60_000,
    });
    expect(r).toMatchObject({ foraDoPregao: 1, emFormacao: 2, gravados: { "5m": 10, "15m": 3, "1h": 0 } });
    expect(r.primeiro).toBe(s[0]!.abertura);
    expect(r.ultimo).toBe(s[9]!.abertura);
  });

  it("rodar duas vezes deixa o mesmo banco", async () => {
    const b = bancoDeCandlesFalso();
    const primeiroDia = sementeWinIbov5m().slice(0, 84);
    await substituirCandlesB3(b.banco, "WIN", "5m", dia(1), primeiroDia, { agora: DEPOIS });
    const antes = [b.de("WIN", "5m"), b.de("WIN", "15m"), b.de("WIN", "1h")];
    const r = await substituirCandlesB3(b.banco, "WIN", "5m", dia(1), primeiroDia, { agora: DEPOIS });
    expect(r.apagados).toBe(84 + 28 + 7);
    expect([b.de("WIN", "5m"), b.de("WIN", "15m"), b.de("WIN", "1h")]).toEqual(antes);
  });

  it("recusa trecho fora da grade do maior intervalo ou candle fora do trecho", async () => {
    const b = bancoDeCandlesFalso();
    const s = sementeWinIbov5m().slice(0, 84);
    await expect(
      substituirCandlesB3(b.banco, "WIN", "5m", { inicio: dia(1).inicio + M5, fim: dia(1).fim }, s, {
        agora: DEPOIS,
      }),
    ).rejects.toThrow(/grade de 1h/);
    await expect(substituirCandlesB3(b.banco, "WIN", "5m", dia(2), s, { agora: DEPOIS })).rejects.toThrow(
      /fora do trecho/,
    );
    expect(b.total()).toBe(0);
  });
});
