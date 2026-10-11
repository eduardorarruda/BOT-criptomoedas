import { describe, expect, it } from "vitest";
import {
  agruparPor,
  alternarNaLista,
  contarAtivos,
  contarPor,
  contemTexto,
  filtrarCom,
  escreverLista,
  lerLista,
  normalizarTexto,
  ordenarPor,
  paginar,
} from "./logica";

describe("busca por texto", () => {
  it("ignora acento, caixa e espaços extras", () => {
    expect(normalizarTexto("  Ação  PREÇO ")).toBe("acao preco");
  });

  it("exige todas as palavras, em qualquer campo e em qualquer ordem", () => {
    expect(contemTexto("btc rsi", ["BTCUSDT", "RSI(14) < 30"])).toBe(true);
    expect(contemTexto("btc sma", ["BTCUSDT", "RSI(14) < 30"])).toBe(false);
    expect(contemTexto("tesouro", ["Tesouro IPCA+", null, undefined])).toBe(true);
  });

  it("termo vazio aceita tudo", () => {
    expect(contemTexto(undefined, ["x"])).toBe(true);
    expect(contemTexto("   ", [])).toBe(true);
  });
});

describe("listas na URL", () => {
  it("lê só os valores permitidos, sem repetir, na ordem da definição", () => {
    expect(lerLista("LCI,CDB,XYZ,CDB", ["CDB", "LCI", "LCA"])).toEqual(["CDB", "LCI"]);
    expect(lerLista(undefined, ["CDB"])).toEqual([]);
    expect(lerLista(["LCA", "CDB"], ["CDB", "LCA"])).toEqual(["CDB", "LCA"]);
    expect(lerLista(42, ["CDB"])).toEqual([]);
  });

  it("lista vazia some da URL", () => {
    expect(escreverLista([])).toBeUndefined();
    expect(escreverLista(["CDB", "LCI"])).toBe("CDB,LCI");
  });

  it("alternar põe e tira o valor", () => {
    expect(alternarNaLista(["a"], "b")).toEqual(["a", "b"]);
    expect(alternarNaLista(["a", "b"], "a")).toEqual(["b"]);
  });
});

describe("ordenar", () => {
  const itens = [
    { n: "b", v: 2 },
    { n: "a", v: null },
    { n: "c", v: 10 },
    { n: "d", v: 2 },
  ];

  it("número em ordem decrescente, desconhecido sempre no fim", () => {
    expect(ordenarPor(itens, (i) => i.v, "desc").map((i) => i.n)).toEqual(["c", "b", "d", "a"]);
    expect(ordenarPor(itens, (i) => i.v, "asc").map((i) => i.n)).toEqual(["b", "d", "c", "a"]);
  });

  it("texto em ordem alfabética do português e não muda a lista original", () => {
    const nomes = [{ n: "Éden" }, { n: "abacaxi" }, { n: "Zebra" }];
    expect(ordenarPor(nomes, (i) => i.n, "asc").map((i) => i.n)).toEqual(["abacaxi", "Éden", "Zebra"]);
    expect(nomes[0]!.n).toBe("Éden");
  });
});

describe("agrupar e contar", () => {
  it("agrupa mantendo a ordem de chegada", () => {
    const g = agruparPor(
      [
        { r: "x", id: 1 },
        { r: "y", id: 2 },
        { r: "x", id: 3 },
      ],
      (i) => i.r,
      (chave) => `Robô ${chave}`,
    );
    expect(g.map((x) => [x.titulo, x.itens.map((i) => i.id)])).toEqual([
      ["Robô x", [1, 3]],
      ["Robô y", [2]],
    ]);
  });

  it("conta por chave", () => {
    expect(contarPor(["a", "b", "a"], (x) => x)).toEqual(
      new Map([
        ["a", 2],
        ["b", 1],
      ]),
    );
  });

  it("conta só os filtros que estão valendo", () => {
    const busca = { q: "btc", tipo: "CDB,LCI", visao: "tabela", ordem: undefined, saldo: true };
    expect(contarAtivos(busca, ["visao", "ordem", "dir"])).toBe(3);
    expect(contarAtivos({}, [])).toBe(0);
  });
});

describe("paginar", () => {
  const itens = Array.from({ length: 45 }, (_, i) => i);

  it("corta a página pedida", () => {
    const p = paginar(itens, 2, 20);
    expect(p.itens).toEqual(itens.slice(20, 40));
    expect(p).toMatchObject({ pagina: 2, paginas: 3, total: 45 });
  });

  it("página fora do intervalo cai na última válida (ou na primeira)", () => {
    expect(paginar(itens, 9, 20).pagina).toBe(3);
    expect(paginar(itens, 0, 20).pagina).toBe(1);
    expect(paginar([], 3, 20)).toMatchObject({ pagina: 1, paginas: 1, itens: [] });
  });
});

describe("filtrar com predicados nomeados (contagem facetada)", () => {
  const itens = [
    { cor: "azul", grande: true },
    { cor: "azul", grande: false },
    { cor: "verde", grande: true },
  ];
  const predicados = {
    cor: (i: (typeof itens)[number]) => i.cor === "azul",
    tamanho: (i: (typeof itens)[number]) => i.grande,
  };

  it("aplica todos", () => {
    expect(filtrarCom(itens, predicados)).toEqual([{ cor: "azul", grande: true }]);
  });

  it("deixa um de fora para contar as opções daquele filtro", () => {
    expect(contarPor(filtrarCom(itens, predicados, "cor"), (i) => i.cor)).toEqual(
      new Map([
        ["azul", 1],
        ["verde", 1],
      ]),
    );
  });
});
