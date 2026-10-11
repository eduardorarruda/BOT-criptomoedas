import type { VisaoImobiliario } from "@zentrade/contratos/esquemas";
import { beforeAll, describe, expect, it } from "vitest";
import { filtrarCom, validarBusca } from "../../componentes/filtros";
import { criarFonteImobiliarioDemo } from "./demo";
import {
  alocacaoPorTipo,
  buscaImobiliario,
  ordenarImobiliario,
  predicadosImobiliario,
  totalizarImobiliario,
} from "./filtros";

const validar = validarBusca(buscaImobiliario);
let v: VisaoImobiliario;
const filtrar = (q: Record<string, unknown>) => filtrarCom(v.itens, predicadosImobiliario(validar(q)));

beforeAll(async () => {
  v = await criarFonteImobiliarioDemo("2026-10-11").visao({});
});

describe("filtros do imobiliário", () => {
  it("sem filtro, os totais e a alocação batem com os da API", () => {
    const t = totalizarImobiliario(v.itens);
    expect(Number(t.patrimonio)).toBeCloseTo(Number(v.patrimonio), 2);
    expect(Number(t.rendaMensal)).toBeCloseTo(Number(v.rendaMensal), 2);
    expect(Number(t.resultadoLiquido)).toBeCloseTo(Number(v.resultadoLiquido), 2);
    expect(alocacaoPorTipo(v.itens).map((f) => f.tipo)).toEqual(v.alocacao.map((a) => a.tipo));
  });

  it("tipo, moeda, financiamento e situação", () => {
    expect(filtrar({ tipo: "fii,reit" }).every((i) => ["fii", "reit"].includes(i.investimento.tipo))).toBe(
      true,
    );
    expect(filtrar({ moeda: "USD" }).map((i) => i.investimento.nome)).toEqual(["Realty Income"]);
    const financiados = filtrar({ financiamento: "com" });
    expect(financiados.length).toBeGreaterThan(0);
    expect(financiados.every((i) => i.investimento.financiamento !== null)).toBe(true);
    expect(filtrar({ financiamento: "sem" }).length + financiados.length).toBe(v.itens.length);
    expect(filtrar({ situacao: "encerrado" }).map((i) => i.investimento.nome)).toEqual([
      "Casa para reformar (vendida)",
    ]);
  });

  it("busca por nome ou ticker, sem acento", () => {
    expect(filtrar({ q: "galpoes" })).toHaveLength(1);
    expect(filtrar({ q: "ubatuba" })[0]!.investimento.tipo).toBe("temporada");
  });

  it("ordena por patrimônio (padrão), TIR, DY e nome; sem número vai para o fim", () => {
    const porValor = ordenarImobiliario(v.itens, {});
    expect(Number(porValor[0]!.metricas!.patrimonioLiquido)).toBeGreaterThanOrEqual(
      Number(porValor[1]!.metricas!.patrimonioLiquido),
    );
    const porDy = ordenarImobiliario(v.itens, { ordem: "dy" });
    expect(porDy.at(-1)!.metricas?.dividendYield ?? null).toBeNull();
    const porNome = ordenarImobiliario(v.itens, { ordem: "nome" });
    expect(porNome[0]!.investimento.nome.localeCompare(porNome[1]!.investimento.nome, "pt-BR")).toBeLessThan(
      0,
    );
    expect(ordenarImobiliario(v.itens, { ordem: "tir", dir: "asc" })).toHaveLength(v.itens.length);
    expect(ordenarImobiliario(v.itens, { ordem: "resultado" })).toHaveLength(v.itens.length);
    expect(ordenarImobiliario(v.itens, { ordem: "renda" })).toHaveLength(v.itens.length);
  });

  it("totais do recorte somam só os filtrados", () => {
    const fiis = filtrar({ tipo: "fii" });
    const t = totalizarImobiliario(fiis);
    expect(t.patrimonio).toBe(Number(fiis[0]!.metricas!.patrimonioLiquido).toFixed(2));
    expect(totalizarImobiliario([])).toMatchObject({ patrimonio: "0.00", semMetricas: 0 });
  });
});
