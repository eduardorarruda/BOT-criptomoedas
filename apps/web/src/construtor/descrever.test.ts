import { describe, expect, it } from "vitest";
import { novoComparar, novoGrupo, novoNao, type NoComparar } from "./arvore";
import { frase, fraseComparador, fraseDirecao, frasesLados, frasesSaidas, linhas } from "./descrever";

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

  it("descreve as saídas na ordem em que o robô olha para elas", () => {
    expect(frasesSaidas({ stop: 0.025 })).toEqual(["stop 2,5% abaixo da entrada"]);
    expect(frasesSaidas({ stop: null })).toEqual([]);
    expect(
      frasesSaidas({
        stop: 0.1,
        stopAtr: { periodo: 14, multiplo: 2 },
        stopMovel: { tipo: "percentual", distancia: 0.03 },
        empate: { gatilho: 0.02 },
        tempoMaximo: 24,
        tamanhoPorVolatilidade: { periodo: 20, multiplo: 1.5 },
      }),
    ).toEqual([
      "stop a 2 × ATR(14) abaixo da entrada, no máximo 10%",
      "stop móvel 3% abaixo da maior máxima desde a entrada (só sobe)",
      "depois de +2%, o stop vai para o empate (as duas taxas pagas)",
      "sai depois de 24 candles, se nada disso vier antes",
      "tamanho: risco por operação ÷ (1,5 × ATR(20))",
    ]);
    expect(
      frasesSaidas({
        stop: null,
        stopAtr: { periodo: 14, multiplo: 2 },
        stopMovel: { tipo: "atr", periodo: 22, multiplo: 3 },
      }),
    ).toEqual([
      "stop a 2 × ATR(14) abaixo da entrada",
      "stop móvel a 3 × ATR(22) da maior máxima desde a entrada (só sobe)",
    ]);
  });

  it("indicadores novos com a linha escolhida", () => {
    const no: NoComparar = {
      ...novoComparar(),
      esquerda: { tipo: "preco" },
      comparador: "<",
      direita: { tipo: "indicador", nome: "bollinger", periodo: 20, desvios: 2, saida: "inferior" },
    };
    expect(frase(no)).toBe("preço abaixo de banda inferior de Bollinger(20, 2)");
  });

  it("VWAP sem parâmetros e faixa de abertura em minutos", () => {
    const no: NoComparar = {
      ...novoComparar(),
      esquerda: { tipo: "preco" },
      comparador: ">",
      direita: { tipo: "indicador", nome: "vwap" },
    };
    expect(frase(no)).toMatch(/^preço acima de VWAP/);
    expect(frase(no)).not.toContain("undefined");
  });

  it("descreve a direção", () => {
    expect(fraseDirecao("comprado")).toBe("só compra (ganha quando o preço sobe)");
    expect(fraseDirecao("vendido")).toBe(
      "só vende a descoberto (ganha quando o preço cai); só no backtest do mini índice",
    );
    expect(fraseDirecao("ambos")).toBe(
      "compra ou vende a descoberto, conforme a regra que valer; o lado vendido só no backtest do mini índice",
    );
  });

  it("descreve os dois lados: compra, venda e recompra", () => {
    const entrada = novoComparar();
    const vende = {
      ...novoComparar(),
      comparador: ">" as const,
      direita: { tipo: "numero" as const, valor: 70 },
    };
    expect(
      frasesLados({ direcao: "comprado", entrada, saida: null, entradaVendida: vende, saidaVendida: null }),
    ).toEqual([
      { arvore: "entrada", verbo: "Compra quando", texto: "RSI(14) abaixo de 30" },
      { arvore: "saida", verbo: "Vende quando", texto: "o preço chegar ao stop ou ao alvo" },
    ]);
    expect(
      frasesLados({
        direcao: "ambos",
        entrada,
        saida: entrada,
        entradaVendida: vende,
        saidaVendida: entrada,
      }),
    ).toEqual([
      { arvore: "entrada", verbo: "Compra quando", texto: "RSI(14) abaixo de 30" },
      {
        arvore: "saida",
        verbo: "Sai da compra quando",
        texto: "RSI(14) abaixo de 30, ou no stop ou no alvo",
      },
      { arvore: "entradaVendida", verbo: "Vende quando", texto: "RSI(14) acima de 70" },
      {
        arvore: "saidaVendida",
        verbo: "Recompra quando",
        texto: "RSI(14) abaixo de 30, ou no stop ou no alvo",
      },
    ]);
    expect(
      frasesLados({ direcao: "vendido", entrada, saida: entrada, entradaVendida: vende, saidaVendida: null }),
    ).toEqual([
      { arvore: "entradaVendida", verbo: "Vende quando", texto: "RSI(14) acima de 70" },
      { arvore: "saidaVendida", verbo: "Recompra quando", texto: "o preço chegar ao stop ou ao alvo" },
    ]);
  });

  it("no vendido, as saídas são o espelho", () => {
    expect(
      frasesSaidas(
        {
          stop: 0.003,
          stopAtr: { periodo: 14, multiplo: 2 },
          stopMovel: { tipo: "percentual", distancia: 0.01 },
        },
        "vendido",
      ),
    ).toEqual([
      "stop a 2 × ATR(14) acima da entrada, no máximo 0,3%",
      "stop móvel 1% acima da menor mínima desde a entrada (só desce)",
    ]);
    expect(
      frasesSaidas({ stop: 0.01, stopMovel: { tipo: "atr", periodo: 14, multiplo: 3 } }, "ambos"),
    ).toEqual([
      "stop 1% abaixo da entrada",
      "stop móvel a 3 × ATR(14) da maior máxima desde a entrada (só sobe)",
      "na venda, o espelho: stop acima da entrada e stop móvel pela menor mínima (só desce)",
    ]);
  });
});
