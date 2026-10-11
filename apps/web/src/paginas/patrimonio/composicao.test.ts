import type { Patrimonio } from "@zentrade/contratos/esquemas";
import { dec } from "@zentrade/dominio";
import { describe, expect, it } from "vitest";
import { patrimonioDemo } from "./demo";
import { descreverItens, fatiasDoPatrimonio, nadaCadastrado, SITUACAO, valorDaClasse } from "./composicao";

const classe = (sobrescrever: Partial<Patrimonio["classes"][number]>): Patrimonio["classes"][number] => ({
  classe: "cripto",
  situacao: "completa",
  valor: "100",
  investido: null,
  fracao: "1",
  itens: 1,
  atualizadoEm: null,
  moedaOrigem: null,
  avisos: [],
  ...sobrescrever,
});

const patrimonio = (classes: Patrimonio["classes"]): Patrimonio => ({
  moeda: "BRL",
  total: "100",
  parcial: false,
  calculadoEm: 1,
  cambio: null,
  classes,
  avisos: [],
});

describe("composição do patrimônio", () => {
  it("uma fatia por classe com fração positiva, na ordem das classes, com o rótulo da tela", () => {
    const p = patrimonio([
      classe({ classe: "cripto", fracao: "0.2" }),
      classe({ classe: "renda_fixa", fracao: "0.8" }),
      classe({ classe: "imobiliario", fracao: null, situacao: "vazia", valor: "0" }),
    ]);
    expect(fatiasDoPatrimonio(p)).toEqual([
      { classe: "cripto", rotulo: "Cripto", fracao: "0.2" },
      { classe: "renda_fixa", rotulo: "Renda fixa", fracao: "0.8" },
    ]);
  });

  it("classe com fração zero (dívida maior que o bem) não vira fatia", () => {
    const p = patrimonio([
      classe({ classe: "renda_fixa", fracao: "1" }),
      classe({ classe: "imobiliario", fracao: "0" }),
    ]);
    expect(fatiasDoPatrimonio(p).map((f) => f.classe)).toEqual(["renda_fixa"]);
  });

  it("nada cadastrado só quando as três classes estão vazias", () => {
    const vazio = patrimonio([
      classe({ situacao: "vazia" }),
      classe({ classe: "renda_fixa", situacao: "vazia" }),
    ]);
    expect(nadaCadastrado(vazio)).toBe(true);
    expect(nadaCadastrado(patrimonio([classe({ situacao: "indisponivel", valor: null })]))).toBe(false);
  });

  it("itens no singular e no plural, com o nome de cada classe", () => {
    expect(descreverItens("cripto", 1)).toBe("1 moeda");
    expect(descreverItens("cripto", 3)).toBe("3 moedas");
    expect(descreverItens("renda_fixa", 2)).toBe("2 títulos");
    expect(descreverItens("imobiliario", 1)).toBe("1 investimento");
  });

  it("valor da classe em reais; sem valor, em USDT quando houver, ou traço", () => {
    expect(valorDaClasse(classe({ valor: "1234.5" }))).toBe("R$ 1.234,50");
    const soUsdt = classe({ valor: null, moedaOrigem: { moeda: "USDT", valor: "800" } });
    expect(valorDaClasse(soUsdt)).toBe("US$ 800,00 em USDT");
    expect(valorDaClasse(classe({ valor: null }))).toBe("—");
  });

  it("cada situação tem texto e tom (nunca só a cor)", () => {
    expect(SITUACAO.indisponivel).toMatchObject({ texto: "Fora do total", tom: "atencao" });
    expect(SITUACAO.parcial.tom).toBe("atencao");
    expect(SITUACAO.completa.texto).toBe("Completo");
  });
});

describe("patrimônio de demonstração", () => {
  it("fecha: o total é a soma das classes e as fatias somam 1", () => {
    const p = patrimonioDemo(1_790_000_000_000);
    const soma = p.classes.reduce((s, c) => s.plus(dec(c.valor ?? "0")), dec(0));
    expect(p.total).toBe(soma.toFixed());
    const fracoes = p.classes.reduce((s, c) => s.plus(dec(c.fracao ?? "0")), dec(0));
    expect(fracoes.minus(1).abs().lte("0.000002")).toBe(true);
    expect(p.avisos.join(" ")).toMatch(/demonstração/);
  });
});
