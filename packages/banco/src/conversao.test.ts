import { describe, expect, it } from "vitest";
import {
  decisaoDeLinha,
  decimalOpcional,
  decimalTexto,
  estrategiaDeLinha,
  ordemDeLinha,
} from "./conversao.js";

const em = new Date(Date.UTC(2026, 0, 1));

describe("conversão de linhas do banco para o contrato", () => {
  it("normaliza o NUMERIC de 18 casas", () => {
    expect(decimalTexto("0.010000000000000000")).toBe("0.01");
    expect(decimalTexto("-4.500000000000000000")).toBe("-4.5");
    expect(decimalOpcional(null)).toBeUndefined();
  });

  it("decisão: campos opcionais só aparecem quando existem", () => {
    const base = {
      id: "d1",
      usuarioId: "u1",
      roboId: "r1",
      em,
      sinal: { acao: "AGUARDAR", explicacao: "nada" },
      proposta: null,
      quantidade: null,
      preco: "10.000000000000000000",
      risco: { aprovada: false, barreiras: [{ codigo: "pausado", mensagem: "parada" }] },
      estado: "barrada" as const,
      custoIaUsd: null,
      expiraEm: null,
      decididaPor: null,
      stopEfetivo: null,
      alvoEfetivo: null,
      resultado: null,
      avaliadaEm: null,
      atualizadaEm: em,
    };
    expect(decisaoDeLinha(base)).toEqual({
      id: "d1",
      roboId: "r1",
      em: em.getTime(),
      sinal: { acao: "AGUARDAR", explicacao: "nada" },
      preco: "10",
      risco: { aprovada: false, barreiras: [{ codigo: "pausado", mensagem: "parada" }] },
      estado: "barrada",
    });
    const completa = decisaoDeLinha(
      { ...base, resultado: "1.5", avaliadaEm: em, custoIaUsd: "0.02", quantidade: "2" },
      "o1",
    );
    expect(completa).toMatchObject({ ordemId: "o1", custoIaUsd: "0.02", desfecho: { resultado: "1.5" } });
  });

  it("estratégia com regra de saída e ordem com motivo", () => {
    const regra = {
      tipo: "comparar",
      esquerda: { tipo: "preco" },
      comparador: ">",
      direita: { tipo: "numero", valor: 1 },
    };
    const e = estrategiaDeLinha({
      estrategiaId: "e1",
      versao: 2,
      usuarioId: "u1",
      nome: "x",
      regra: { entrada: regra, saida: regra },
      stop: "0.020000000000000000",
      alvoLiquido: "0.01",
      taxa: "0.001",
      criadaEm: em,
    });
    expect(e).toMatchObject({ versao: 2, stop: 0.02, saida: regra });
    const o = ordemDeLinha(
      {
        id: "o1",
        usuarioId: "u1",
        roboId: "r1",
        decisaoId: "d1",
        idCliente: "zt-1",
        idCorretora: null,
        simbolo: "BTCUSDT",
        lado: "VENDA",
        quantidade: "1",
        estado: "REJEITADA",
        motivo: "saldo insuficiente",
        criadaEm: em,
        atualizadaEm: em,
      },
      [],
    );
    expect(o).toMatchObject({ motivo: "saldo insuficiente", execucoes: [] });
  });
});
