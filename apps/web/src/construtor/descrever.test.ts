import { describe, expect, it } from "vitest";
import { novoComparar, novoGrupo, novoNao, type NoComparar } from "./arvore";
import { frase, fraseComparador, linhas } from "./descrever";

const preco = (comparador: NoComparar["comparador"]): NoComparar => ({
  ...novoComparar(),
  esquerda: { tipo: "preco" },
  comparador,
  direita: { tipo: "multiplicar", operando: { tipo: "indicador", nome: "sma", periodo: 50 }, fator: 1.02 },
});

describe("prévia em linguagem natural", () => {
  it("usa os rótulos do domínio", () => {
    expect(frase(novoComparar())).toBe("RSI(14) abaixo de 30");
    expect(frase(preco("cruzouAcima"))).toBe("preço cruzar para cima de 1,02 × SMA(50)");
  });

  it("junta grupos com e/ou e põe parênteses nos aninhados", () => {
    const raiz = novoGrupo("e", [novoComparar(), novoGrupo("ou", [preco(">"), novoNao(preco("<="))])]);
    expect(frase(raiz)).toBe(
      "RSI(14) abaixo de 30 e (preço acima de 1,02 × SMA(50) ou não (preço no máximo 1,02 × SMA(50)))",
    );
  });

  it("descreve vazios sem quebrar", () => {
    expect(frase(novoGrupo("e"))).toBe("(grupo vazio)");
    expect(frase(novoNao())).toBe("não ((vazio))");
    expect(frase(null)).toBe("(vazio)");
  });

  it("gera linhas indentadas para leitura", () => {
    const raiz = novoGrupo("ou", [novoComparar(), novoNao(), novoGrupo("e")]);
    expect(linhas(raiz)).toEqual([
      { nivel: 0, texto: "basta uma destas valer:" },
      { nivel: 1, texto: "RSI(14) abaixo de 30" },
      { nivel: 1, texto: "esta NÃO pode valer:" },
      { nivel: 2, texto: "falta uma condição aqui" },
      { nivel: 1, texto: "todas estas precisam valer: (nenhuma ainda)" },
    ]);
  });

  it("tem verbo para cada comparador", () => {
    expect(fraseComparador(">=")).toBe("pelo menos");
    expect(fraseComparador("cruzouAbaixo")).toBe("cruzar para baixo de");
  });
});
