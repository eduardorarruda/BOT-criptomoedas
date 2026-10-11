import type { DecisaoDTO } from "@zentrade/contratos";
import { describe, expect, it } from "vitest";
import type { CoresGrafico } from "./cores";
import { comAlfa } from "./cores";
import { estiloDecisao, marcadores, paraVela, velaComPreco } from "./velas";

const cores = {
  texto: "t",
  apagado: "a",
  linha: "l",
  marca: "m",
  ganho: "g",
  perda: "p",
  atencao: "at",
  superficie: "s",
} satisfies CoresGrafico;
const decisao = (estado: DecisaoDTO["estado"], acao: "COMPRAR" | "VENDER", em: number): DecisaoDTO => ({
  id: `${estado}-${em}`,
  roboId: "r",
  em,
  sinal: { acao, explicacao: "" },
  preco: "1",
  risco: { aprovada: true, barreiras: [] },
  estado,
});

describe("velas do gráfico", () => {
  it("converte a vela da API", () => {
    expect(
      paraVela({ abertura: 60_000, abre: "1.5", maxima: "2", minima: "1", fecha: "1.8", volume: "3" }),
    ).toEqual({
      time: 60,
      open: 1.5,
      high: 2,
      low: 1,
      close: 1.8,
    });
  });

  it("estica a vela atual com o preço novo", () => {
    const v = velaComPreco({ time: 0 as never, open: 10, high: 11, low: 9, close: 10 }, 12, 30_000, "1m");
    expect(v).toEqual({ time: 0, open: 10, high: 12, low: 9, close: 12 });
  });

  it("abre vela nova quando o intervalo vira", () => {
    const v = velaComPreco({ time: 0 as never, open: 10, high: 11, low: 9, close: 10 }, 8, 61_000, "1m");
    expect(v).toEqual({ time: 60, open: 10, high: 10, low: 8, close: 8 });
  });

  it("dá forma e cor por estado da decisão", () => {
    expect(estiloDecisao(decisao("executada", "COMPRAR", 0))).toMatchObject({
      forma: "arrowUp",
      cor: "marca",
      posicao: "belowBar",
    });
    expect(estiloDecisao(decisao("executada", "VENDER", 0))).toMatchObject({
      forma: "arrowDown",
      posicao: "aboveBar",
    });
    expect(estiloDecisao(decisao("barrada", "COMPRAR", 0)).rotulo).toBe("Barrada");
    expect(estiloDecisao(decisao("aguardando_aprovacao", "COMPRAR", 0)).cor).toBe("atencao");
    expect(estiloDecisao(decisao("falhou", "COMPRAR", 0)).cor).toBe("perda");
    expect(estiloDecisao(decisao("registrada", "COMPRAR", 0)).rotulo).toBe("Só registro");
  });

  it("marca decisões no início da vela, em ordem, ignorando as antigas", () => {
    const m = marcadores(
      [
        decisao("executada", "COMPRAR", 185_000),
        decisao("barrada", "COMPRAR", 70_000),
        decisao("registrada", "VENDER", 1000),
      ],
      "1m",
      cores,
      60_000,
    );
    expect(m.map((x) => x.time)).toEqual([60, 180]);
    expect(m[0]?.color).toBe("at");
  });

  it("aplica transparência em cor hex", () => {
    expect(comAlfa("#3ddc8e", 0.2)).toBe("rgba(61, 220, 142, 0.2)");
    expect(comAlfa("#fff", 1)).toBe("rgba(255, 255, 255, 1)");
    expect(comAlfa("nada", 1)).toBe("nada");
  });
});
