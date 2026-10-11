import type { Evento, OrdemDTO } from "@zentrade/contratos/esquemas";
import { describe, expect, it } from "vitest";
import { descrever } from "./descrever";

const ordem = (o: Partial<OrdemDTO>): Evento => ({
  tipo: "ordem",
  ordem: {
    id: "o",
    decisaoId: "d",
    idCliente: "zt",
    simbolo: "BTCUSDT",
    lado: "COMPRA",
    quantidade: "0.001",
    estado: "PENDENTE",
    criadaEm: 1,
    execucoes: [],
    ...o,
  },
});

describe("descrição dos eventos ao vivo", () => {
  it("candle em alta e em baixa, com os preços", () => {
    const c = (abre: string, fecha: string): Evento => ({
      tipo: "candle",
      roboId: "r",
      simbolo: "BTCUSDT",
      intervalo: "15m",
      candle: { abertura: 1, abre, maxima: "110", minima: "90", fecha, volume: "1" },
    });
    expect(descrever(c("100", "105"))?.titulo).toBe("Candle de 15 min fechou em alta");
    expect(descrever(c("100", "95"))?.detalhe).toContain("fechou 95,0000");
  });

  it("sinal com o porquê da regra", () => {
    const d = descrever({
      tipo: "sinal",
      roboId: "r",
      acao: "COMPRAR",
      explicacao: "RSI 28 < 30",
      preco: "1",
      em: 1,
    });
    expect(d).toMatchObject({
      titulo: "A regra deu sinal de compra",
      detalhe: "RSI 28 < 30",
      tom: "atencao",
    });
    expect(
      descrever({ tipo: "sinal", roboId: "r", acao: "AGUARDAR", explicacao: "x", preco: "1", em: 1 })?.tom,
    ).toBe("neutro");
  });

  it("análise: início, etapa e fim (inclusive falha)", () => {
    const base = { tipo: "analise" as const, analiseId: "a", roboId: "r" };
    expect(descrever({ ...base, concluida: false })?.titulo).toMatch(/começou/);
    expect(
      descrever({ ...base, concluida: false, etapa: { ferramenta: "f", descricao: "Leu notícias", em: 1 } })
        ?.detalhe,
    ).toBe("Leu notícias");
    expect(descrever({ ...base, concluida: true, resultado: "comprar" })?.titulo).toBe("A IA propôs comprar");
    expect(descrever({ ...base, concluida: true, resultado: "falhou" })?.tom).toBe("perda");
    expect(descrever({ ...base, concluida: true })?.titulo).toBe("A IA propôs aguardar");
  });

  it("ordem enviada, executada e rejeitada", () => {
    expect(descrever(ordem({}))?.titulo).toBe("Ordem de compra enviada");
    const exec = descrever(
      ordem({
        estado: "PREENCHIDA",
        execucoes: [{ preco: "64000", quantidade: "0.001", taxaCotacao: "0.064", em: 1 }],
      }),
    );
    expect(exec?.titulo).toBe("Ordem de compra executada");
    expect(exec?.detalhe).toContain("64.000,00");
    const rej = descrever(ordem({ lado: "VENDA", estado: "REJEITADA", motivo: "saldo insuficiente" }));
    expect(rej).toMatchObject({
      titulo: "Ordem de venda rejeitada",
      detalhe: "saldo insuficiente",
      tom: "perda",
    });
    expect(descrever(ordem({ estado: "CANCELADA" }))?.titulo).toBe("Ordem de compra cancelada");
  });

  it("posição aberta e fechada com o resultado", () => {
    const p = (quantidade: string, resultadoRealizado: string): Evento => ({
      tipo: "posicao",
      roboId: "r",
      simbolo: "BTCUSDT",
      quantidade,
      precoMedio: "100",
      resultadoRealizado,
      taxasPagas: "0.2",
      em: 1,
    });
    expect(descrever(p("1", "0"))?.titulo).toBe("Posição atualizada");
    expect(descrever(p("0", "-2"))).toMatchObject({ titulo: "Posição fechada", tom: "perda" });
    expect(descrever(p("0", "3"))?.tom).toBe("ganho");
  });

  it("decisão e risco; preço não vira linha", () => {
    const decisao: Evento = {
      tipo: "decisao",
      decisao: {
        id: "d",
        roboId: "r",
        em: 1,
        sinal: { acao: "COMPRAR", explicacao: "sinal" },
        preco: "1",
        risco: { aprovada: false, barreiras: [] },
        estado: "barrada",
      },
    };
    expect(descrever(decisao)).toMatchObject({ titulo: "Decisão: barrada pelo risco", detalhe: "sinal" });
    expect(
      descrever({
        tipo: "risco",
        roboId: "r",
        barreira: { codigo: "c", mensagem: "Exposição passaria do limite" },
        em: 1,
      })?.detalhe,
    ).toMatch(/Exposição/);
    expect(descrever({ tipo: "preco", simbolo: "B", preco: "1", em: 1 })).toBeNull();
  });
});
