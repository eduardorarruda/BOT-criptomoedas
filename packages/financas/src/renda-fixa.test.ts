import { dec, type Valor } from "@zentrade/dominio";
import { describe, expect, it } from "vitest";
import { listarDiasUteis } from "./calendario.js";
import { fatorPrefixado } from "./indexadores.js";
import {
  fatorBruto,
  percentualDoCdiEquivalente,
  posicaoDoTitulo,
  type Indices,
  type PosicaoCalculada,
  type Titulo,
} from "./renda-fixa.js";

const mapa = <K extends string>(pares: Record<K, string>): ReadonlyMap<K, Valor> =>
  new Map(Object.entries(pares).map(([k, v]) => [k as K, dec(v as string)]));

/** CDI e Selic constantes em todos os dias úteis de [de, ate). */
function diaria(de: string, ate: string, taxa: string): ReadonlyMap<string, Valor> {
  return new Map(listarDiasUteis(de, ate).map((d) => [d, dec(taxa)]));
}

const VAZIO: Indices = { cdi: new Map(), selic: new Map(), ipca: new Map(), poupanca: new Map() };

export const titulo = (t: Partial<Titulo>): Titulo => ({
  id: "t1",
  tipo: "CDB",
  nome: "CDB Banco X",
  emissor: "Banco X",
  indexador: "CDI",
  percentualIndexador: dec(100),
  taxaAnual: null,
  dataAplicacao: "2026-10-07",
  vencimento: null,
  valorAplicado: dec(10000),
  liquidez: "diaria",
  carenciaAte: null,
  informado: null,
  grupo: null,
  ...t,
});

const calculada = (p: ReturnType<typeof posicaoDoTitulo>): PosicaoCalculada => {
  if (!p.disponivel) throw new Error(`posição indisponível: ${p.motivo}`);
  return p;
};

describe("posição de um CDB 100% do CDI", () => {
  const indices: Indices = {
    ...VAZIO,
    cdi: mapa({ "2026-10-07": "0.050788", "2026-10-08": "0.050788", "2026-10-09": "0.050788" }),
  };
  const p = calculada(posicaoDoTitulo(titulo({}), indices, { hoje: "2026-10-10" }));

  it("valor bruto pelo CDI composto, em centavos", () => {
    expect(p.bruto.toFixed()).toBe("10015.24");
    expect(p.rendimentoBruto.toFixed()).toBe("15.24");
    expect(p.fonte).toBe("indices");
    expect(p.ate).toBe("2026-10-10");
  });

  it("com 3 dias, IOF de 90% e IR de 22,5% sobre o resto", () => {
    expect(p.iof.toFixed()).toBe("13.72");
    expect(p.ir.toFixed()).toBe("0.34");
    expect(p.liquido.toFixed()).toBe("10001.18");
    expect(p.rendimentoLiquido.toFixed()).toBe("1.18");
    expect(p.diasCorridos).toBe(3);
  });

  it("rendeu 100% do CDI do período", () => {
    expect(p.percentualDoCdi?.toFixed()).toBe("100");
    expect(p.cdiPeriodoPct?.toDecimalPlaces(4).toFixed()).toBe("0.1524");
  });
});

describe("tipos de rendimento", () => {
  it("prefixado: (1 + taxa)^(du/252), sem depender de índice", () => {
    const t = titulo({
      tipo: "TESOURO_PREFIXADO",
      indexador: "PREFIXADO",
      percentualIndexador: null,
      taxaAnual: dec(12),
      dataAplicacao: "2026-01-02",
      valorAplicado: dec(1000),
    });
    const p = calculada(posicaoDoTitulo(t, VAZIO, { hoje: "2027-01-04" }));
    expect(p.diasUteis).toBe(249);
    expect(p.bruto.toFixed()).toBe(
      dec(1000)
        .times(fatorPrefixado(dec(12), 249))
        .toDecimalPlaces(2, 1)
        .toFixed(),
    );
    expect(p.aliquotaIr.toFixed()).toBe("0.175");
    expect(p.percentualDoCdi).toBeNull();
    expect(p.avisos.join(" ")).toMatch(/CDI/);
  });

  it("Selic + spread (Tesouro Selic na curva)", () => {
    const t = titulo({
      tipo: "TESOURO_SELIC",
      indexador: "SELIC",
      percentualIndexador: null,
      taxaAnual: dec("0.05"),
      dataAplicacao: "2026-10-07",
    });
    const indices = { ...VAZIO, selic: diaria("2026-10-07", "2026-10-10", "0.050788") };
    const p = calculada(posicaoDoTitulo(t, indices, { hoje: "2026-10-10" }));
    const esperado = dec(10000)
      .times(fatorBruto(t, indices, "2026-10-07", "2026-10-10").fator)
      .toDecimalPlaces(2, 1);
    expect(p.bruto.toFixed()).toBe(esperado.toFixed());
    expect(p.avisos.join(" ")).toMatch(/na curva/);
  });

  it("IPCA+: inflação do período vezes a taxa real", () => {
    const t = titulo({
      tipo: "TESOURO_IPCA",
      indexador: "IPCA",
      percentualIndexador: null,
      taxaAnual: dec(6),
      dataAplicacao: "2026-01-01",
      valorAplicado: dec(1000),
    });
    const indices = { ...VAZIO, ipca: mapa({ "2026-01": "0.5", "2026-02": "0.4" }) };
    const p = calculada(posicaoDoTitulo(t, indices, { hoje: "2026-03-01" }));
    const du = listarDiasUteis("2026-01-01", "2026-03-01").length;
    const esperado = dec(1000)
      .times("1.00902")
      .times(fatorPrefixado(dec(6), du))
      .toDecimalPlaces(2, 1);
    expect(p.bruto.toFixed()).toBe(esperado.toFixed());
  });

  it("IPCA do mês corrente ainda não publicado: usa a projeção e avisa", () => {
    const t = titulo({
      tipo: "TESOURO_IPCA",
      indexador: "IPCA",
      percentualIndexador: null,
      taxaAnual: dec(6),
      dataAplicacao: "2026-01-01",
    });
    const indices = { ...VAZIO, ipca: mapa({ "2026-01": "0.5" }) };
    const p = calculada(posicaoDoTitulo(t, indices, { hoje: "2026-02-15", ipcaProjetadoAnual: dec(4) }));
    expect(p.avisos.join(" ")).toMatch(/2026-02.*projeção de 4% ao ano/);
  });

  it("poupança: só os aniversários completos, isenta", () => {
    const t = titulo({
      tipo: "POUPANCA",
      indexador: "POUPANCA",
      percentualIndexador: null,
      dataAplicacao: "2026-01-10",
      valorAplicado: dec(1000),
    });
    const indices = { ...VAZIO, poupanca: mapa({ "2026-01-10": "0.6", "2026-02-10": "0.5" }) };
    const p = calculada(posicaoDoTitulo(t, indices, { hoje: "2026-03-10" }));
    expect(p.bruto.toFixed()).toBe("1011.03");
    const antes = calculada(posicaoDoTitulo(t, indices, { hoje: "2026-03-09" }));
    expect(antes.bruto.toFixed()).toBe("1006");
    expect(p.ir.toFixed()).toBe("0");
    expect(p.liquido.toFixed()).toBe("1011.03");
    expect(p.isentoIr).toBe(true);
  });

  it("CDI + spread", () => {
    const t = titulo({ taxaAnual: dec(2) });
    const indices = { ...VAZIO, cdi: diaria("2026-10-07", "2026-10-10", "0.05") };
    const r = fatorBruto(t, indices, "2026-10-07", "2026-10-10");
    expect(r.fator.toFixed(10)).toBe(
      dec("1.0005")
        .pow(3)
        .times(fatorPrefixado(dec(2), 3))
        .toFixed(10),
    );
  });
});

describe("dados que faltam e dados da instituição", () => {
  it("sem CDI no período: posição indisponível, dizendo o que falta", () => {
    const p = posicaoDoTitulo(titulo({}), VAZIO, { hoje: "2026-10-10" });
    expect(p.disponivel).toBe(false);
    if (!p.disponivel) expect(p.motivo).toMatch(/faltam dados do CDI/);
  });

  it("prefixado sem taxa: indisponível", () => {
    const t = titulo({ indexador: "PREFIXADO", percentualIndexador: null, taxaAnual: null });
    const p = posicaoDoTitulo(t, VAZIO, { hoje: "2026-10-10" });
    expect(p.disponivel).toBe(false);
  });

  it("CDI publicado só até ontem: calcula até lá e diz a data", () => {
    const indices = { ...VAZIO, cdi: mapa({ "2026-10-07": "0.05", "2026-10-08": "0.05" }) };
    const p = calculada(posicaoDoTitulo(titulo({}), indices, { hoje: "2026-10-10" }));
    expect(p.ate).toBe("2026-10-09");
    expect(p.avisos.join(" ")).toMatch(/09\/10\/2026/);
  });

  it("valores da instituição (Pluggy) mandam no bruto, no IR e no líquido", () => {
    const t = titulo({
      informado: {
        em: "2026-10-10",
        bruto: dec("10020"),
        liquido: dec("10010"),
        ir: dec("4"),
        iof: dec("6"),
        fonte: "Pluggy",
      },
    });
    const p = calculada(posicaoDoTitulo(t, VAZIO, { hoje: "2026-10-11" }));
    expect(p.fonte).toBe("instituicao");
    expect(p.bruto.toFixed()).toBe("10020");
    expect(p.liquido.toFixed()).toBe("10010");
    expect(p.ir.toFixed()).toBe("4");
    expect(p.percentualDoCdi).toBeNull();
  });

  it("instituição sem IR informado: o IR é estimado", () => {
    const t = titulo({
      informado: {
        em: "2026-10-10",
        bruto: dec("10100"),
        liquido: null,
        ir: null,
        iof: null,
        fonte: "Pluggy",
      },
    });
    const p = calculada(posicaoDoTitulo(t, VAZIO, { hoje: "2026-10-11" }));
    expect(p.iof.toFixed()).toBe("90");
    expect(p.liquido.toFixed()).toBe("10007.75");
  });

  it("título vencido: a conta para no vencimento", () => {
    const t = titulo({
      indexador: "PREFIXADO",
      percentualIndexador: null,
      taxaAnual: dec(10),
      dataAplicacao: "2025-01-02",
      vencimento: "2026-01-02",
      valorAplicado: dec(1000),
    });
    const p = calculada(posicaoDoTitulo(t, VAZIO, { hoje: "2026-10-10" }));
    expect(p.ate).toBe("2026-01-02");
    expect(p.vencido).toBe(true);
  });
});

describe("percentualDoCdiEquivalente", () => {
  it("acha o percentual que reproduz o fator do título", () => {
    const cdi = diaria("2026-01-02", "2026-07-01", "0.05");
    const alvo = fatorBruto(
      titulo({ percentualIndexador: dec(117) }),
      { ...VAZIO, cdi },
      "2026-01-02",
      "2026-07-01",
    ).fator;
    expect(percentualDoCdiEquivalente(alvo, cdi, "2026-01-02", "2026-07-01")?.toFixed()).toBe("117");
  });

  it("sem CDI no período não compara", () => {
    expect(percentualDoCdiEquivalente(dec("1.01"), new Map(), "2026-01-02", "2026-07-01")).toBeNull();
  });
});
