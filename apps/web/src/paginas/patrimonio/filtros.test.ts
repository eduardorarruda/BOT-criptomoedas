import { describe, expect, it } from "vitest";
import { validarBusca } from "../../componentes/filtros";
import { patrimonioDemo } from "./demo";
import { buscaPatrimonio, classesEscolhidas, diferencaDaClasse, somarClasses } from "./filtros";

const p = patrimonioDemo(Date.UTC(2026, 9, 11));
const validar = validarBusca(buscaPatrimonio);

describe("patrimônio: quais classes somar", () => {
  it("sem escolha, todas; a soma bate com o total da API", () => {
    const todas = classesEscolhidas(validar({}));
    expect(todas).toEqual(["cripto", "renda_fixa", "imobiliario"]);
    const s = somarClasses(p, todas);
    expect(Number(s.total)).toBeCloseTo(Number(p.total), 2);
    expect(s.parcial).toBe(false);
    expect(s.fatias.map((f) => f.classe)).toEqual(["cripto", "renda_fixa", "imobiliario"]);
  });

  it("só algumas: total e fatias recalculados entre elas", () => {
    const s = somarClasses(p, classesEscolhidas(validar({ classes: "renda_fixa,cripto" })));
    const rf = p.classes.find((c) => c.classe === "renda_fixa")!;
    const cripto = p.classes.find((c) => c.classe === "cripto")!;
    expect(Number(s.total)).toBeCloseTo(Number(rf.valor) + Number(cripto.valor), 2);
    expect(s.fatias.reduce((t, f) => t + Number(f.fracao), 0)).toBeCloseTo(1, 8);
    expect(s.fracao("imobiliario")).toBeNull();
  });

  it("classe sem valor em reais deixa a soma parcial e fica sem fatia", () => {
    const semCambio = {
      ...p,
      classes: p.classes.map((c) =>
        c.classe === "cripto" ? { ...c, valor: null, fracao: null, situacao: "indisponivel" as const } : c,
      ),
    };
    const s = somarClasses(semCambio, ["cripto", "renda_fixa"]);
    expect(s.parcial).toBe(true);
    expect(s.fatias.map((f) => f.classe)).toEqual(["renda_fixa"]);
    expect(s.fracao("cripto")).toBeNull();
    expect(somarClasses(semCambio, ["cripto"]).total).toBe("0");
  });

  it("diferença entre valor e investido só quando os dois existem", () => {
    const rf = p.classes.find((c) => c.classe === "renda_fixa")!;
    expect(diferencaDaClasse(rf)).toBe("3210.37");
    expect(diferencaDaClasse(p.classes.find((c) => c.classe === "cripto")!)).toBeNull();
  });
});
