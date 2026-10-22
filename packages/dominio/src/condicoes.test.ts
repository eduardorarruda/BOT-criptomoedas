import { describe, expect, it } from "vitest";
import { detalharRegra, motivosDeNao } from "./condicoes.js";
import type { Regra } from "./regras.js";

const preco = { tipo: "preco" } as const;
const numero = (valor: number) => ({ tipo: "numero", valor }) as const;
const maior = (n: number): Regra => ({
  tipo: "comparar",
  esquerda: preco,
  comparador: ">",
  direita: numero(n),
});
const menor = (n: number): Regra => ({
  tipo: "comparar",
  esquerda: preco,
  comparador: "<",
  direita: numero(n),
});
const ctx = { fechamentos: [100] };

describe("condições da regra, uma a uma", () => {
  it("cada folha traz o texto com os valores e se vale, sem o sufixo sim/não", () => {
    const c = detalharRegra(maior(90), ctx);
    expect(c).toEqual({ tipo: "condicao", valor: true, texto: "preço (100) > 90" });
  });

  it("E e OU guardam as folhas na ordem; NÃO guarda a condição negada", () => {
    const c = detalharRegra(
      {
        tipo: "e",
        regras: [maior(90), { tipo: "ou", regras: [menor(50), { tipo: "nao", regra: maior(200) }] }],
      },
      ctx,
    );
    expect(c.tipo).toBe("e");
    expect(c.valor).toBe(true);
    const ou = c.filhos?.[1];
    expect(ou?.tipo).toBe("ou");
    expect(ou?.filhos?.map((f) => f.valor)).toEqual([false, true]);
    expect(ou?.filhos?.[1]?.filhos?.[0]?.texto).toBe("preço (100) > 200");
  });

  it("dá o mesmo valor que a avaliação da regra (mesmo percurso)", () => {
    const regra: Regra = { tipo: "e", regras: [maior(90), menor(95)] };
    expect(detalharRegra(regra, ctx).valor).toBe(false);
  });

  it("motivos de ficar de fora: só as condições que falharam num E", () => {
    const c = detalharRegra({ tipo: "e", regras: [maior(90), menor(95), maior(500)] }, ctx);
    expect(motivosDeNao(c)).toEqual(["preço (100) < 95", "preço (100) > 500"]);
  });

  it("num OU que falhou, todas as alternativas falharam", () => {
    const c = detalharRegra({ tipo: "ou", regras: [menor(95), maior(500)] }, ctx);
    expect(motivosDeNao(c)).toEqual(["preço (100) < 95", "preço (100) > 500"]);
  });

  it("NÃO que falhou: a condição vetada aconteceu", () => {
    const c = detalharRegra({ tipo: "nao", regra: maior(90) }, ctx);
    expect(c.valor).toBe(false);
    expect(motivosDeNao(c)).toEqual(["preço (100) > 90 (e a regra exige que não)"]);
  });

  it("quem já vale não tem motivo", () => {
    expect(motivosDeNao(detalharRegra(maior(90), ctx))).toEqual([]);
  });
});
