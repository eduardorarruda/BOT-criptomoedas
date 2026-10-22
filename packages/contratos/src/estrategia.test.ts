import { INDICADORES, MODELOS, validarEstrategia } from "@zentrade/dominio";
import { describe, expect, it } from "vitest";
import { EstrategiaEsquema, estrategiaDoDTO } from "./dados.js";
import { OperandoEsquema, RegraEsquema } from "./regra.js";

const base = {
  id: "e1",
  nome: "Exemplo",
  versao: 1,
  entrada: {
    tipo: "comparar",
    esquerda: { tipo: "preco" },
    comparador: ">",
    direita: { tipo: "numero", valor: 1 },
  },
  stop: 0.05,
  alvoLiquido: 0.1,
  taxa: 0.001,
} as const;

describe("esquema das regras com os indicadores novos", () => {
  it("aceita o operando padrão de cada indicador do catálogo e os campos do candle", () => {
    for (const d of Object.values(INDICADORES)) expect(OperandoEsquema.parse(d.padrao)).toEqual(d.padrao);
    for (const tipo of ["preco", "abertura", "maxima", "minima", "volume"])
      expect(OperandoEsquema.safeParse({ tipo }).success).toBe(true);
  });

  it("recusa saída que o indicador não tem e indicador sem a saída", () => {
    const bollinger = { tipo: "indicador", nome: "bollinger", periodo: 20, desvios: 2, saida: "topo" };
    expect(OperandoEsquema.safeParse(bollinger).success).toBe(false);
    expect(OperandoEsquema.safeParse({ tipo: "indicador", nome: "adx", periodo: 14 }).success).toBe(false);
    expect(
      OperandoEsquema.safeParse({ tipo: "indicador", nome: "macd", periodo: 12, saida: "macd" }).success,
    ).toBe(false);
    expect(OperandoEsquema.safeParse({ tipo: "fechamento" }).success).toBe(false);
  });

  it("estratégias gravadas antes (só SMA/EMA/RSI) continuam válidas", () => {
    const antiga = { tipo: "indicador", nome: "sma", periodo: 50 };
    expect(RegraEsquema.safeParse({ ...base.entrada, direita: antiga }).success).toBe(true);
  });
});

describe("esquema da estratégia com as saídas novas", () => {
  it("aceita todos os modelos de exemplo, e a volta ao domínio é a mesma estratégia", () => {
    for (const m of MODELOS) {
      const dto = EstrategiaEsquema.parse({ id: m.id, nome: m.nome, versao: 1, ...m.estrategia });
      const dominio = estrategiaDoDTO(dto);
      expect(dominio).toEqual(m.estrategia);
      expect(validarEstrategia(dominio)).toEqual([]);
    }
  });

  it("recusa saídas fora das faixas", () => {
    const com = (extra: object) => EstrategiaEsquema.safeParse({ ...base, ...extra }).success;
    expect(com({ stopAtr: { periodo: 14, multiplo: 2 } })).toBe(true);
    expect(com({ stopAtr: { periodo: 0, multiplo: 2 } })).toBe(false);
    expect(com({ stopAtr: { periodo: 14, multiplo: 25 } })).toBe(false);
    expect(com({ stopMovel: { tipo: "percentual", distancia: 0.6 } })).toBe(false);
    expect(com({ stopMovel: { tipo: "atr", periodo: 14, multiplo: 3 } })).toBe(true);
    expect(com({ stopMovel: { tipo: "fixo" } })).toBe(false);
    expect(com({ empate: { gatilho: 1 } })).toBe(false);
    expect(com({ tempoMaximo: 1.5 })).toBe(false);
    expect(com({ tempoMaximo: 1001 })).toBe(false);
    expect(com({ tamanhoPorVolatilidade: { periodo: 20, multiplo: 2 } })).toBe(true);
    expect(com({ tamanhoPorAlocacao: { fracao: 1 } })).toBe(true);
    expect(com({ tamanhoPorAlocacao: { fracao: 0.25 } })).toBe(true);
    expect(com({ tamanhoPorAlocacao: { fracao: 0 } })).toBe(false);
    expect(com({ tamanhoPorAlocacao: { fracao: 1.5 } })).toBe(false);
  });

  it("o tamanho por alocação chega ao domínio", () => {
    const dominio = estrategiaDoDTO(EstrategiaEsquema.parse({ ...base, tamanhoPorAlocacao: { fracao: 1 } }));
    expect(dominio.tamanhoPorAlocacao).toEqual({ fracao: 1 });
  });

  it("sem os campos novos, o domínio recebe a estratégia sem chaves vazias", () => {
    const dominio = estrategiaDoDTO(EstrategiaEsquema.parse(base));
    expect(Object.keys(dominio).sort()).toEqual(["alvoLiquido", "entrada", "stop", "taxa"]);
  });
});
