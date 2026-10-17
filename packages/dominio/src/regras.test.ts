import { describe, expect, it } from "vitest";
import type { OperandoIndicador } from "./catalogo.js";
import { INDICADORES, nomeIndicador } from "./catalogo.js";
import { contextoDeCandles } from "./contexto.js";
import { dec } from "./dinheiro.js";
import { avaliar, rotulo, validarRegra, type Operando, type Regra } from "./regras.js";

// 15 fechamentos em 100 e o último em 98: SMA(15) ≈ 99,87
const fechamentos = [...Array<number>(14).fill(100), 98];
const preco = { tipo: "preco" } as const;
const sma15 = { tipo: "indicador", nome: "sma", periodo: 15 } as const;

const abaixoDaMedia: Regra = {
  tipo: "comparar",
  esquerda: preco,
  comparador: "<",
  direita: { tipo: "multiplicar", operando: sma15, fator: 0.99 },
};

describe("árvore de regras", () => {
  it("avalia comparação com operando composto e explica com os números", () => {
    const r = avaliar(abaixoDaMedia, { fechamentos });
    expect(r.valor).toBe(true);
    expect(r.explicacao).toMatch(/^preço \(98\) < 0,99 × SMA\(15\) \(98,8\d*\): sim$/);
  });

  it("E, OU e NÃO combinam recursivamente", () => {
    const falso: Regra = {
      tipo: "comparar",
      esquerda: preco,
      comparador: ">",
      direita: { tipo: "numero", valor: 1000 },
    };
    expect(avaliar({ tipo: "e", regras: [abaixoDaMedia, falso] }, { fechamentos }).valor).toBe(false);
    expect(avaliar({ tipo: "ou", regras: [falso, abaixoDaMedia] }, { fechamentos }).valor).toBe(true);
    const nao = avaliar({ tipo: "nao", regra: falso }, { fechamentos });
    expect(nao.valor).toBe(true);
    expect(nao.explicacao).toMatch(/^não \(preço/);
  });

  it("cruzou abaixo compara o candle anterior com o atual", () => {
    const cruzou: Regra = {
      tipo: "comparar",
      esquerda: preco,
      comparador: "cruzouAbaixo",
      direita: { tipo: "numero", valor: 99 },
    };
    expect(avaliar(cruzou, { fechamentos }).valor).toBe(true);
    const cruzouAcima: Regra = { ...cruzou, comparador: "cruzouAcima" };
    expect(avaliar(cruzouAcima, { fechamentos }).valor).toBe(false);
  });

  it("dado insuficiente nunca vira sinal verdadeiro", () => {
    const r = avaliar(abaixoDaMedia, { fechamentos: [100, 99] });
    expect(r.valor).toBe(false);
    expect(r.explicacao).toMatch(/dados insuficientes/);
  });

  it("todos os comparadores", () => {
    const c = (comparador: "<=" | ">=" | ">", valor: number): boolean =>
      avaliar(
        { tipo: "comparar", esquerda: preco, comparador, direita: { tipo: "numero", valor } },
        { fechamentos },
      ).valor;
    expect(c("<=", 98)).toBe(true);
    expect(c(">=", 98)).toBe(true);
    expect(c(">", 98)).toBe(false);
  });

  it("aceita EMA e RSI como operandos", () => {
    const rsiBaixo: Regra = {
      tipo: "comparar",
      esquerda: { tipo: "indicador", nome: "rsi", periodo: 14 },
      comparador: "<",
      direita: { tipo: "numero", valor: 30 },
    };
    expect(avaliar(rsiBaixo, { fechamentos }).valor).toBe(true);
    const emaAcima: Regra = {
      tipo: "comparar",
      esquerda: { tipo: "indicador", nome: "ema", periodo: 5 },
      comparador: ">",
      direita: preco,
    };
    expect(avaliar(emaAcima, { fechamentos }).valor).toBe(true);
  });

  describe("validação (a árvore vem do construtor visual)", () => {
    it("aceita a regra bem formada", () => {
      expect(validarRegra(abaixoDaMedia)).toEqual([]);
    });

    it("recusa grupo vazio, período inválido e fator absurdo", () => {
      expect(validarRegra({ tipo: "e", regras: [] })).toEqual([expect.stringMatching(/pelo menos uma/)]);
      expect(
        validarRegra({ ...abaixoDaMedia, esquerda: { tipo: "indicador", nome: "sma", periodo: 0 } }),
      ).toEqual([expect.stringMatching(/período/)]);
      expect(
        validarRegra({ ...abaixoDaMedia, direita: { tipo: "multiplicar", operando: sma15, fator: -1 } }),
      ).toEqual([expect.stringMatching(/fator/)]);
      expect(validarRegra({ ...abaixoDaMedia, direita: { tipo: "numero", valor: Number.NaN } })).toEqual([
        expect.stringMatching(/número/),
      ]);
    });

    it("limita a profundidade da árvore", () => {
      let r: Regra = abaixoDaMedia;
      for (let i = 0; i < 20; i++) r = { tipo: "nao", regra: r };
      expect(validarRegra(r)).toEqual([expect.stringMatching(/profund/)]);
    });
  });

  describe("candles completos (OHLCV)", () => {
    // 21 candles: fechamentos subindo de 100 a 120, máxima +1, mínima −1, volume 10;
    // o último rompe com volume 30.
    const n = 21;
    const ctx = {
      fechamentos: Array.from({ length: n }, (_, i) => 100 + i),
      aberturas: Array.from({ length: n }, (_, i) => 99.5 + i),
      maximas: Array.from({ length: n }, (_, i) => 101 + i),
      minimas: Array.from({ length: n }, (_, i) => 99 + i),
      volumes: [...Array<number>(n - 1).fill(10), 30],
    };

    it("abertura, máxima, mínima e volume são do último candle fechado", () => {
      const c = (tipo: "abertura" | "maxima" | "minima" | "volume"): string =>
        avaliar(
          { tipo: "comparar", esquerda: { tipo }, comparador: ">", direita: { tipo: "numero", valor: 0 } },
          ctx,
        ).explicacao;
      expect(c("abertura")).toBe("abertura (119,5) > 0: sim");
      expect(c("maxima")).toBe("máxima (121) > 0: sim");
      expect(c("minima")).toBe("mínima (119) > 0: sim");
      expect(c("volume")).toBe("volume (30) > 0: sim");
    });

    it("explica em português com a saída escolhida do indicador", () => {
      const rompeu: Regra = {
        tipo: "comparar",
        esquerda: { tipo: "preco" },
        comparador: ">=",
        direita: { tipo: "indicador", nome: "donchian", periodo: 20, saida: "superior" },
      };
      expect(avaliar(rompeu, ctx)).toEqual({
        valor: true,
        explicacao: "preço (120) ≥ topo de Donchian(20) (120): sim",
      });
      const bandas: Regra = {
        tipo: "comparar",
        esquerda: { tipo: "preco" },
        comparador: "<",
        direita: { tipo: "indicador", nome: "bollinger", periodo: 20, desvios: 2, saida: "inferior" },
      };
      expect(avaliar(bandas, ctx).explicacao).toMatch(
        /^preço \(120\) < banda inferior de Bollinger\(20, 2\) \(98,\d+\): não$/,
      );
      const volume: Regra = {
        tipo: "comparar",
        esquerda: { tipo: "indicador", nome: "volumeRelativo", periodo: 20 },
        comparador: ">=",
        direita: { tipo: "numero", valor: 2 },
      };
      expect(avaliar(volume, ctx).explicacao).toBe("volume relativo(20) (3) ≥ 2: sim");
    });

    it("sem máxima e mínima no contexto (chamador antigo), o indicador diz que faltam dados", () => {
      const atr: Regra = {
        tipo: "comparar",
        esquerda: { tipo: "indicador", nome: "atr", periodo: 14 },
        comparador: ">",
        direita: { tipo: "numero", valor: 0 },
      };
      expect(avaliar(atr, { fechamentos: ctx.fechamentos })).toEqual({
        valor: false,
        explicacao: "dados insuficientes para ATR(14)",
      });
      expect(avaliar(atr, { ...ctx, maximas: ctx.maximas.slice(1) }).valor).toBe(false);
      expect(avaliar(atr, ctx).valor).toBe(true);
    });

    it("cada indicador do catálogo avalia num contexto completo e tem rótulo", () => {
      const longo = contextoDeCandles(
        Array.from({ length: 80 }, (_, i) => {
          const fecha = 100 + 10 * Math.sin(i / 6) + i * 0.1;
          // candles de 1 h por 3 dias: os indicadores do pregão precisam ver o começo do dia
          const abertura = Date.parse("2026-10-14T09:00:00-03:00") + i * 3_600_000;
          return {
            abertura,
            fechamento: abertura + 3_599_999,
            abre: dec(fecha - 0.2),
            maxima: dec(fecha + 1),
            minima: dec(fecha - 1),
            fecha: dec(fecha),
            volume: dec(100 + (i % 7)),
          };
        }),
      );
      for (const definicao of Object.values(INDICADORES)) {
        const op = definicao.padrao;
        const r = avaliar(
          { tipo: "comparar", esquerda: op, comparador: ">", direita: { tipo: "numero", valor: -1e9 } },
          longo,
        );
        expect(r.valor, rotulo(op)).toBe(true);
        expect(validarRegra({ tipo: "comparar", esquerda: op, comparador: ">", direita: preco })).toEqual([]);
      }
    });

    it("rótulos dos indicadores com várias saídas", () => {
      const r = (op: Operando): string => rotulo(op);
      expect(
        r({ tipo: "indicador", nome: "macd", rapida: 12, lenta: 26, periodoSinal: 9, saida: "histograma" }),
      ).toBe("histograma do MACD(12, 26, 9)");
      expect(r({ tipo: "indicador", nome: "estocastico", periodo: 14, suavizacao: 3, saida: "d" })).toBe(
        "%D estocástico(14, 3)",
      );
      expect(r({ tipo: "indicador", nome: "adx", periodo: 14, saida: "menosDI" })).toBe("−DI(14)");
      expect(
        r({ tipo: "indicador", nome: "bollinger", periodo: 20, desvios: 2.5, saida: "percentualB" }),
      ).toBe("%B de Bollinger(20; 2,5)");
      expect(r({ tipo: "indicador", nome: "donchian", periodo: 10, saida: "meio" })).toBe(
        "meio de Donchian(10)",
      );
      expect(["sma", "estocastico", "volumeRelativo", "adx"].map((n) => nomeIndicador(n as never))).toEqual([
        "SMA",
        "estocástico",
        "volume relativo",
        "ADX",
      ]);
    });
  });

  describe("validação dos indicadores novos", () => {
    const com = (op: OperandoIndicador): string[] =>
      validarRegra({ tipo: "comparar", esquerda: op, comparador: ">", direita: preco });

    it("MACD: rápida menor que a lenta, todos inteiros", () => {
      expect(
        com({ tipo: "indicador", nome: "macd", rapida: 26, lenta: 12, periodoSinal: 9, saida: "macd" }),
      ).toEqual([expect.stringMatching(/rápida menor que a lenta/)]);
      expect(
        com({ tipo: "indicador", nome: "macd", rapida: 12, lenta: 26, periodoSinal: 0, saida: "sinal" }),
      ).toHaveLength(1);
    });

    it("Bollinger: desvios no limite; estocástico: suavização inteira", () => {
      expect(com({ tipo: "indicador", nome: "bollinger", periodo: 20, desvios: 0, saida: "media" })).toEqual([
        expect.stringMatching(/desvios/),
      ]);
      expect(
        com({ tipo: "indicador", nome: "bollinger", periodo: 20, desvios: 11, saida: "media" }),
      ).toHaveLength(1);
      expect(com({ tipo: "indicador", nome: "estocastico", periodo: 14, suavizacao: 0, saida: "k" })).toEqual(
        [expect.stringMatching(/suavização/)],
      );
      expect(com({ tipo: "indicador", nome: "donchian", periodo: 501, saida: "superior" })).toEqual([
        expect.stringMatching(/período de Donchian/),
      ]);
    });

    it("saída faltando ou indicador desconhecido (dado vindo de fora)", () => {
      const semSaida = { tipo: "indicador", nome: "adx", periodo: 14 } as unknown as OperandoIndicador;
      expect(com(semSaida)).toEqual([expect.stringMatching(/qual linha de ADX/)]);
      const inventado = { tipo: "indicador", nome: "ichimoku", periodo: 9 } as unknown as OperandoIndicador;
      expect(com(inventado)).toEqual(["indicador desconhecido: ichimoku"]);
    });
  });
});
