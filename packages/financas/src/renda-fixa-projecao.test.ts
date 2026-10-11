import { dec, type Valor } from "@zentrade/dominio";
import { describe, expect, it } from "vitest";
import { diasUteis, listarDiasUteis } from "./calendario.js";
import { fatorPrefixado, taxaDiariaDeAnual } from "./indexadores.js";
import {
  comPremissasInformadas,
  premissasDosIndices,
  projetar,
  type Premissas,
} from "./renda-fixa-projecao.js";
import { posicaoDoTitulo, type Indices, type PosicaoCalculada, type Titulo } from "./renda-fixa.js";

const mapa = (pares: Record<string, string>): ReadonlyMap<string, Valor> =>
  new Map(Object.entries(pares).map(([k, v]) => [k, dec(v)]));

const VAZIO: Indices = { cdi: new Map(), selic: new Map(), ipca: new Map(), poupanca: new Map() };

const prefixado: Titulo = {
  id: "p",
  tipo: "CDB",
  nome: "CDB pré",
  emissor: null,
  indexador: "PREFIXADO",
  percentualIndexador: null,
  taxaAnual: dec(12),
  dataAplicacao: "2026-01-02",
  vencimento: "2027-01-04",
  valorAplicado: dec(1000),
  liquidez: "vencimento",
  carenciaAte: null,
  informado: null,
  grupo: null,
};

const posicao = (t: Titulo, indices: Indices, hoje: string): PosicaoCalculada => {
  const p = posicaoDoTitulo(t, indices, { hoje });
  if (!p.disponivel) throw new Error(p.motivo);
  return p;
};

const SEM: Premissas = { cdiAnual: null, selicAnual: null, ipcaAnual: null, poupancaMensal: null };

describe("premissas tiradas dos índices publicados", () => {
  it("CDI, Selic e poupança: o último publicado; IPCA: o acumulado de 12 meses", () => {
    const ipca = mapa(
      Object.fromEntries(
        Array.from({ length: 12 }, (_, i) => [`2025-${String(i + 1).padStart(2, "0")}`, "0.5"]),
      ),
    );
    const p = premissasDosIndices(
      {
        cdi: mapa({ "2026-10-08": "0.05", "2026-10-09": "0.050788" }),
        selic: mapa({ "2026-10-09": "0.050788" }),
        ipca,
        poupanca: mapa({ "2026-10-01": "0.6698" }),
      },
      "2026-10-10",
    );
    expect(p.cdiAnual?.valor.toDecimalPlaces(2).toFixed()).toBe("13.65");
    expect(p.cdiAnual?.descricao).toMatch(/13,65% ao ano.*09\/10\/2026/);
    expect(p.selicAnual?.valor.toDecimalPlaces(2).toFixed()).toBe("13.65");
    expect(p.ipcaAnual?.valor.toDecimalPlaces(4).toFixed()).toBe("6.1678");
    expect(p.ipcaAnual?.descricao).toMatch(/12 meses até 12\/2025/);
    expect(p.poupancaMensal?.valor.toFixed()).toBe("0.6698");
  });

  it("sem dado não há premissa (nada inventado)", () => {
    expect(premissasDosIndices(VAZIO, "2026-10-10")).toEqual(SEM);
  });

  it("IPCA com menos de 12 meses publicados não vira premissa", () => {
    expect(
      premissasDosIndices({ ...VAZIO, ipca: mapa({ "2026-08": "0.1", "2026-09": "0.2" }) }, "2026-10-10")
        .ipcaAnual,
    ).toBeNull();
  });

  it("a pessoa pode informar as próprias premissas", () => {
    const p = comPremissasInformadas(SEM, { cdiAnual: dec(10), ipcaAnual: dec("4.5") });
    expect(p.cdiAnual?.descricao).toMatch(/10% ao ano, informado por você/);
    expect(p.ipcaAnual?.descricao).toMatch(/4,5%/);
    expect(p.selicAnual).toBeNull();
  });
});

describe("projeção até o vencimento", () => {
  it("prefixado: pontos mensais até o vencimento, com IR que cai com o tempo", () => {
    const pos = posicao(prefixado, VAZIO, "2026-03-02");
    const r = projetar(prefixado, pos, SEM);
    if (!r.disponivel) throw new Error(r.motivo);
    expect(r.fim).toBe("2027-01-04");
    expect(r.pontos[0]?.dia).toBe("2026-03-02");
    expect(r.pontos.at(-1)?.dia).toBe("2027-01-04");
    const final = r.pontos.at(-1)!;
    const esperado = pos.bruto.times(fatorPrefixado(dec(12), diasUteis("2026-03-02", "2027-01-04")));
    expect(final.bruto.toFixed()).toBe(esperado.toDecimalPlaces(2, 1).toFixed());
    expect(final.aliquotaIr.toFixed()).toBe("0.175");
    expect(r.premissas.join(" ")).toMatch(/12% ao ano/);
    expect(r.premissas.join(" ")).toMatch(/Lei 11\.033/);
  });

  it("CDI: usa a premissa e o percentual do título", () => {
    const t: Titulo = {
      ...prefixado,
      indexador: "CDI",
      percentualIndexador: dec(110),
      taxaAnual: null,
      dataAplicacao: "2026-10-01",
      vencimento: "2026-12-01",
    };
    const cdi = new Map(listarDiasUteis("2026-10-01", "2026-10-10").map((d) => [d, dec("0.05")]));
    const pos = posicao(t, { ...VAZIO, cdi }, "2026-10-10");
    const premissas = comPremissasInformadas(SEM, { cdiAnual: dec("13.65") });
    const r = projetar(t, pos, premissas);
    if (!r.disponivel) throw new Error(r.motivo);
    const du = diasUteis(pos.ate, "2026-12-01");
    const diaria = taxaDiariaDeAnual(dec("13.65")).div(100).times("1.1");
    expect(r.pontos.at(-1)?.bruto.toFixed()).toBe(
      pos.bruto.times(dec(1).plus(diaria).pow(du)).toDecimalPlaces(2, 1).toFixed(),
    );
    expect(r.premissas.join(" ")).toMatch(/110% do CDI/);
  });

  it("sem vencimento: projeta 12 meses (ou o horizonte pedido)", () => {
    const t: Titulo = { ...prefixado, vencimento: null };
    const pos = posicao(t, VAZIO, "2026-03-02");
    const r = projetar(t, pos, SEM, { horizonteMeses: 6 });
    if (!r.disponivel) throw new Error(r.motivo);
    expect(r.fim).toBe("2026-09-02");
    expect(r.pontos).toHaveLength(7);
  });

  it("IPCA+ sem premissa de IPCA: diz o que falta", () => {
    const t: Titulo = { ...prefixado, tipo: "TESOURO_IPCA", indexador: "IPCA", taxaAnual: dec(6) };
    const pos = posicao(t, { ...VAZIO, ipca: mapa({ "2026-01": "0.4", "2026-02": "0.3" }) }, "2026-03-01");
    const r = projetar(t, pos, SEM);
    expect(r.disponivel).toBe(false);
    if (!r.disponivel) expect(r.motivo).toMatch(/IPCA/);
    const ok = projetar(t, pos, comPremissasInformadas(SEM, { ipcaAnual: dec(4) }));
    expect(ok.disponivel).toBe(true);
  });

  it("Selic e poupança também projetam com as premissas", () => {
    const selic: Titulo = {
      ...prefixado,
      tipo: "TESOURO_SELIC",
      indexador: "SELIC",
      taxaAnual: dec("0.1"),
      dataAplicacao: "2026-10-01",
    };
    const s = new Map(listarDiasUteis("2026-10-01", "2026-10-10").map((d) => [d, dec("0.05")]));
    const r1 = projetar(
      selic,
      posicao(selic, { ...VAZIO, selic: s }, "2026-10-10"),
      comPremissasInformadas(SEM, { selicAnual: dec(13) }),
    );
    expect(r1.disponivel).toBe(true);
    const poup: Titulo = {
      ...prefixado,
      tipo: "POUPANCA",
      indexador: "POUPANCA",
      taxaAnual: null,
      dataAplicacao: "2026-09-10",
      vencimento: null,
    };
    const pos = posicao(poup, { ...VAZIO, poupanca: mapa({ "2026-09-10": "0.6" }) }, "2026-10-10");
    const r2 = projetar(
      poup,
      pos,
      { ...SEM, poupancaMensal: { valor: dec("0.6"), descricao: "0,6% ao mês" } },
      { horizonteMeses: 2 },
    );
    if (!r2.disponivel) throw new Error(r2.motivo);
    expect(r2.pontos.at(-1)?.bruto.toFixed()).toBe(
      pos.bruto.times(dec("1.006").pow(2)).toDecimalPlaces(2, 1).toFixed(),
    );
    const semPremissa = projetar(poup, pos, SEM);
    expect(semPremissa.disponivel).toBe(false);
  });

  it("título já vencido não projeta", () => {
    const pos = posicao(prefixado, VAZIO, "2027-02-01");
    expect(projetar(prefixado, pos, SEM).disponivel).toBe(false);
  });
});
