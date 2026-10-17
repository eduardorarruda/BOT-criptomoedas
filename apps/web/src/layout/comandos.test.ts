import { describe, expect, it } from "vitest";
import { ATALHOS_IR, comandosDeNavegacao, filtrarComandos, type Comando } from "./comandos";

const c = (titulo: string, extra: Partial<Comando> = {}): Comando => ({
  id: titulo,
  titulo,
  grupo: "Ir para",
  executar: () => undefined,
  ...extra,
});

describe("filtrarComandos", () => {
  const lista = [
    c("Visão geral"),
    c("Decisões"),
    c("Estratégias"),
    c("Risco", { palavras: "parar tudo limites" }),
  ];

  it("sem termo, devolve tudo na ordem original", () => {
    expect(filtrarComandos(lista, "").map((x) => x.titulo)).toEqual([
      "Visão geral",
      "Decisões",
      "Estratégias",
      "Risco",
    ]);
  });

  it("ignora acento e caixa", () => {
    expect(filtrarComandos(lista, "decisoes").map((x) => x.titulo)).toEqual(["Decisões"]);
    expect(filtrarComandos(lista, "ESTRATEG").map((x) => x.titulo)).toEqual(["Estratégias"]);
  });

  it("acha pelas palavras extras (sinônimos)", () => {
    expect(filtrarComandos(lista, "parar").map((x) => x.titulo)).toEqual(["Risco"]);
  });

  it("todas as palavras do termo precisam bater", () => {
    expect(filtrarComandos(lista, "visao geral").map((x) => x.titulo)).toEqual(["Visão geral"]);
    expect(filtrarComandos(lista, "visao risco")).toEqual([]);
  });

  it("começo do título vem antes de meio do título", () => {
    const l = [c("Ordens e posições"), c("Posições abertas")];
    expect(filtrarComandos(l, "pos").map((x) => x.titulo)).toEqual(["Posições abertas", "Ordens e posições"]);
  });
});

describe("comandosDeNavegacao", () => {
  it("cria um comando por tela do menu, com o atalho g+letra quando houver", () => {
    const ir: string[] = [];
    const lista = comandosDeNavegacao((para) => ir.push(para));
    const robos = lista.find((x) => x.titulo === "Robôs");
    expect(robos?.grupo).toBe("Ir para");
    expect(robos?.atalho).toBe("g r");
    robos?.executar();
    expect(ir).toEqual(["/robos"]);
  });

  it("os atalhos g+letra não se repetem", () => {
    const letras = Object.keys(ATALHOS_IR);
    expect(new Set(letras).size).toBe(letras.length);
  });
});
