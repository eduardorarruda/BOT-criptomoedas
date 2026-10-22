import { describe, expect, it } from "vitest";
import { dec, paraTexto } from "./dinheiro.js";
import { FOLGA_DA_ALOCACAO, maiorQuantidade } from "./dimensionamento.js";
import type { FiltrosAtivo } from "./tipos.js";

const filtros: FiltrosAtivo = {
  passoQuantidade: dec("0.00001"),
  quantidadeMinima: dec("0.00001"),
  valorMinimo: dec("5"),
  passoPreco: dec("0.01"),
};

describe("dimensionamento por busca binária", () => {
  it("o risco limita: perder no stop não passa do máximo aceito", () => {
    const q = maiorQuantidade({
      preco: dec(60000),
      stop: dec(58800),
      riscoMaximo: dec(10),
      disponivel: dec(100000),
      filtros,
      taxa: 0.001,
    });
    expect(q).not.toBeNull();
    const perda = (x: ReturnType<typeof dec>) =>
      x
        .times(60000 - 58800)
        .plus(x.times(60000).times(0.001))
        .plus(x.times(58800).times(0.001));
    expect(perda(q!).lte(10)).toBe(true);
    // um passo a mais já estoura o risco: é a MAIOR quantidade
    expect(perda(q!.plus(filtros.passoQuantidade)).gt(10)).toBe(true);
    expect(paraTexto(q!)).toBe("0.00758");
  });

  it("o saldo limita quando o risco permitiria mais", () => {
    const q = maiorQuantidade({
      preco: dec(100),
      stop: dec(99),
      riscoMaximo: dec(1000),
      disponivel: dec(50),
      filtros,
      taxa: 0,
    });
    expect(paraTexto(q!)).toBe("0.5");
  });

  it("devolve nulo quando nem o mínimo da corretora cabe", () => {
    expect(
      maiorQuantidade({
        preco: dec(60000),
        stop: dec(58800),
        riscoMaximo: dec(0.01),
        disponivel: dec(100000),
        filtros,
        taxa: 0.001,
      }),
    ).toBeNull();
    expect(
      maiorQuantidade({
        preco: dec(100),
        stop: dec(99),
        riscoMaximo: dec(1000),
        disponivel: dec(4),
        filtros,
        taxa: 0,
      }),
    ).toBeNull();
  });

  it("respeita a quantidade máxima da corretora", () => {
    const q = maiorQuantidade({
      preco: dec(1),
      stop: dec(0.5),
      riscoMaximo: dec(1e9),
      disponivel: dec(1e9),
      filtros: { ...filtros, quantidadeMaxima: dec(1000) },
      taxa: 0,
    });
    expect(paraTexto(q!)).toBe("1000");
  });

  it("recusa stop acima do preço", () => {
    expect(() =>
      maiorQuantidade({
        preco: dec(100),
        stop: dec(101),
        riscoMaximo: dec(1),
        disponivel: dec(1),
        filtros,
        taxa: 0,
      }),
    ).toThrow(/stop/);
  });

  describe("tamanho pela volatilidade (distância de risco opcional)", () => {
    const comum = { preco: dec(100), riscoMaximo: dec(10), disponivel: dec(100000), filtros, taxa: 0 };

    it("risco por operação ÷ (k × ATR): com ATR 2,5 e k = 2, 10 / 5 = 2 unidades", () => {
      const q = maiorQuantidade({ ...comum, stop: dec(99), distanciaRisco: dec(5) });
      expect(paraTexto(q!)).toBe("2");
    });

    it("vale a maior distância: stop mais longe que k × ATR continua mandando", () => {
      const q = maiorQuantidade({ ...comum, stop: dec(90), distanciaRisco: dec(5) });
      expect(paraTexto(q!)).toBe("1");
    });

    it("sem a distância, o resultado é o de sempre; distância maior que o preço não fica negativa", () => {
      expect(maiorQuantidade({ ...comum, stop: dec(99) })).toEqual(
        maiorQuantidade({ ...comum, stop: dec(99), distanciaRisco: dec(0.5) }),
      );
      expect(paraTexto(maiorQuantidade({ ...comum, stop: dec(99), distanciaRisco: dec(500) })!)).toBe("0.1");
    });
  });
  describe("tamanho por alocação (valor alvo opcional, sem olhar o risco)", () => {
    const comum = { preco: dec(100), stop: dec(50), filtros, taxa: 0 };

    it("compra o valor alvo inteiro mesmo que o stop longe estoure o risco por operação", () => {
      const q = maiorQuantidade({
        ...comum,
        riscoMaximo: dec(1),
        disponivel: dec(100000),
        valorAlvo: dec(1000),
      });
      expect(paraTexto(q!)).toBe("10");
    });

    it("o saldo livre e a exposição restante mandam, com folga de 0,5% para deslizamento e spread", () => {
      const q = maiorQuantidade({
        ...comum,
        riscoMaximo: dec(1),
        disponivel: dec(300),
        valorAlvo: dec(1000),
      });
      // 300 × (1 − 0,005) = 298,5 → 2,985 unidades a 100: a ordem a mercado não estoura o saldo
      expect(FOLGA_DA_ALOCACAO).toBe(0.005);
      expect(paraTexto(q!)).toBe("2.985");
    });

    it("a taxa entra no custo: o valor alvo cobre preço mais a taxa de compra", () => {
      const q = maiorQuantidade({
        ...comum,
        taxa: 0.001,
        riscoMaximo: dec(1),
        disponivel: dec(100000),
        valorAlvo: dec(1001),
      });
      expect(paraTexto(q!)).toBe("10");
    });

    it("respeita a quantidade mínima e o valor mínimo da corretora", () => {
      expect(
        maiorQuantidade({ ...comum, riscoMaximo: dec(1), disponivel: dec(100000), valorAlvo: dec(4) }),
      ).toBeNull();
    });

    it("sem valor alvo, o risco por operação manda como sempre", () => {
      const q = maiorQuantidade({ ...comum, riscoMaximo: dec(10), disponivel: dec(100000) });
      expect(paraTexto(q!)).toBe("0.2");
    });
  });
});
