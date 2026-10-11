import { dec, type Valor } from "@zentrade/dominio";
import { describe, expect, it } from "vitest";
import { listarDiasUteis } from "./calendario.js";
import { consolidar, rendimentoNoPeriodo, vencimentos } from "./renda-fixa-carteira.js";
import { posicaoDoTitulo, type Indices, type Titulo } from "./renda-fixa.js";

const VAZIO: Indices = { cdi: new Map(), selic: new Map(), ipca: new Map(), poupanca: new Map() };
const cdiConstante = (de: string, ate: string, taxa = "0.05"): ReadonlyMap<string, Valor> =>
  new Map(listarDiasUteis(de, ate).map((d) => [d, dec(taxa)]));

const base: Titulo = {
  id: "a",
  tipo: "CDB",
  nome: "CDB A",
  emissor: "Banco A",
  indexador: "CDI",
  percentualIndexador: dec(100),
  taxaAnual: null,
  dataAplicacao: "2026-09-01",
  vencimento: "2027-09-01",
  valorAplicado: dec(1000),
  liquidez: "vencimento",
  carenciaAte: null,
  informado: null,
  grupo: null,
};

const indices: Indices = { ...VAZIO, cdi: cdiConstante("2026-01-01", "2026-10-10") };
const HOJE = "2026-10-10";

const titulos: Titulo[] = [
  base,
  { ...base, id: "b", tipo: "LCI", nome: "LCI B", valorAplicado: dec(3000), vencimento: "2026-12-15" },
  {
    ...base,
    id: "c",
    tipo: "TESOURO_PREFIXADO",
    indexador: "PREFIXADO",
    percentualIndexador: null,
    taxaAnual: dec(12),
    valorAplicado: dec(1000),
    vencimento: "2029-01-01",
  },
  { ...base, id: "d", nome: "Sem dado", indexador: "SELIC", vencimento: null },
];

describe("consolidar a carteira", () => {
  const posicoes = titulos.map((t) => posicaoDoTitulo(t, indices, { hoje: HOJE }));
  const c = consolidar(titulos, posicoes, HOJE);

  it("soma aplicado, bruto, impostos e líquido só do que tem posição", () => {
    const disponiveis = posicoes.filter((p) => p.disponivel);
    const somaBruto = disponiveis.reduce((s, p) => s.plus(p.bruto), dec(0));
    expect(c.bruto.toFixed()).toBe(somaBruto.toFixed());
    expect(c.aplicado.toFixed()).toBe("5000");
    expect(c.liquido.lte(c.bruto)).toBe(true);
    expect(c.rendimentoBruto.toFixed()).toBe(somaBruto.minus(5000).toFixed());
    expect(c.quantidade).toBe(4);
    expect(c.indisponiveis).toEqual(["d"]);
  });

  it("alocação por tipo e por indexador, em fração do bruto", () => {
    const tipos = c.porTipo.map((a) => a.chave);
    expect(tipos).toEqual(["LCI", "CDB", "TESOURO_PREFIXADO"]);
    const soma = c.porTipo.reduce((s, a) => s.plus(a.fracao), dec(0));
    expect(soma.toDecimalPlaces(10).toFixed()).toBe("1");
    expect(c.porIndexador.map((a) => a.chave)).toEqual(["CDI", "PREFIXADO"]);
  });

  it("próximo vencimento", () => {
    expect(c.proximoVencimento).toEqual({ tituloId: "b", nome: "LCI B", dia: "2026-12-15" });
  });

  it("carteira vazia não divide por zero", () => {
    const vazia = consolidar([], [], HOJE);
    expect(vazia.bruto.toFixed()).toBe("0");
    expect(vazia.rentabilidadeBrutaPct.toFixed()).toBe("0");
    expect(vazia.porTipo).toEqual([]);
    expect(vazia.proximoVencimento).toBeNull();
  });
});

describe("rendimento no período (ex.: no mês)", () => {
  it("CDB: bruto de hoje menos o bruto no início do mês", () => {
    const r = rendimentoNoPeriodo(base, indices, "2026-10-01", HOJE);
    const hoje = posicaoDoTitulo(base, indices, { hoje: HOJE });
    const inicio = posicaoDoTitulo(base, indices, { hoje: "2026-10-01" });
    if (!hoje.disponivel || !inicio.disponivel) throw new Error("sem posição");
    expect(r?.toDecimalPlaces(1).toFixed()).toBe(hoje.bruto.minus(inicio.bruto).toDecimalPlaces(1).toFixed());
  });

  it("aplicado no meio do mês: conta desde a aplicação", () => {
    const t = { ...base, dataAplicacao: "2026-10-05" };
    const r = rendimentoNoPeriodo(t, indices, "2026-10-01", HOJE);
    const p = posicaoDoTitulo(t, indices, { hoje: HOJE });
    if (!p.disponivel) throw new Error("sem posição");
    expect(r?.toDecimalPlaces(2).toFixed()).toBe(p.rendimentoBruto.toDecimalPlaces(2).toFixed());
  });

  it("aplicado depois do período: zero", () => {
    expect(
      rendimentoNoPeriodo({ ...base, dataAplicacao: "2026-11-01" }, indices, "2026-10-01", HOJE)?.toFixed(),
    ).toBe("0");
  });

  it("título da instituição: escala o bruto informado pelo fator do período", () => {
    const t = {
      ...base,
      informado: { em: HOJE, bruto: dec(2000), liquido: null, ir: null, iof: null, fonte: "Pluggy" },
    };
    const r = rendimentoNoPeriodo(t, indices, "2026-10-01", HOJE);
    expect(r?.gt(0)).toBe(true);
    expect(r?.lt(10)).toBe(true);
  });

  it("sem índice: null", () => {
    expect(rendimentoNoPeriodo(base, VAZIO, "2026-10-01", HOJE)).toBeNull();
  });
});

describe("calendário de vencimentos", () => {
  it("só títulos com vencimento a partir de hoje, em ordem", () => {
    const lista = vencimentos([...titulos, { ...base, id: "e", vencimento: "2026-01-01" }], HOJE);
    expect(lista.map((v) => v.tituloId)).toEqual(["b", "a", "c"]);
    expect(lista[0]).toMatchObject({ dia: "2026-12-15", diasCorridos: 66 });
  });
});
