import type { TituloRendaFixa } from "@zentrade/contratos/esquemas";
import { beforeAll, describe, expect, it } from "vitest";
import { filtrarCom, validarBusca } from "../../componentes/filtros";
import { criarFonteRendaFixaDemo } from "./demo";
import {
  alocacaoPor,
  buscaRendaFixa,
  diasAte,
  encerrado,
  escadaDeVencimentos,
  ordenarTitulos,
  predicadosRendaFixa,
  valorDe,
} from "./filtros";

const AGORA = Date.parse("2026-10-10T15:00:00-03:00");
const HOJE = "2026-10-10";
const validar = validarBusca(buscaRendaFixa);
let titulos: TituloRendaFixa[] = [];
const filtrar = (q: Record<string, unknown>) => filtrarCom(titulos, predicadosRendaFixa(validar(q), HOJE));

beforeAll(async () => {
  titulos = await criarFonteRendaFixaDemo(() => AGORA).titulos();
});

describe("filtros da renda fixa", () => {
  it("tipo, indexador, origem e liquidez (OU dentro, E entre)", () => {
    const r = filtrar({ tipo: "CDB,LCI", indexador: "CDI" });
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((t) => ["CDB", "LCI"].includes(t.tipo) && t.indexador === "CDI")).toBe(true);
    expect(
      filtrar({ origem: "pluggy" })
        .map((t) => t.nome)
        .sort(),
    ).toEqual(["CDB Banco Digital 102%", "LCI Imobiliária 92%"]);
    expect(filtrar({ liquidez: "diaria" }).every((t) => t.liquidez === "diaria")).toBe(true);
  });

  it("vence em N dias: só os ainda ativos dentro da janela", () => {
    const em30 = filtrar({ vence: "30" });
    expect(em30.map((t) => t.nome)).toEqual(["CDB Banco Digital 102%"]);
    expect(filtrar({ vence: "365" }).length).toBeGreaterThan(em30.length);
    expect(filtrar({ vence: "365" }).every((t) => diasAte(t.vencimento!, HOJE) <= 365)).toBe(true);
  });

  it("situação separa os vencidos dos ativos", () => {
    const encerrados = filtrar({ situacao: "encerrado" });
    expect(encerrados.map((t) => t.nome)).toEqual(["CDB Prefixado 12,4% (vencido)"]);
    expect(filtrar({ situacao: "ativo" })).toHaveLength(titulos.length - 1);
    expect(encerrado(encerrados[0]!, HOJE)).toBe(true);
  });

  it("busca por nome ou emissor, sem acento", () => {
    expect(filtrar({ q: "imobiliaria" }).map((t) => t.nome)).toEqual(["LCI Imobiliária 92%"]);
    expect(filtrar({ q: "tesouro nacional" }).every((t) => t.emissor === "Tesouro Nacional")).toBe(true);
  });

  it("ordena por vencimento (mais perto primeiro, sem data no fim), valor e rendimento", () => {
    const porVencimento = ordenarTitulos(titulos, {});
    expect(porVencimento[0]!.vencimento! <= porVencimento[1]!.vencimento!).toBe(true);
    expect(porVencimento.at(-1)!.vencimento).toBeNull();
    const porValor = ordenarTitulos(titulos, { ordem: "valor" });
    expect(valorDe(porValor[0]!)).toBeGreaterThanOrEqual(valorDe(porValor[1]!));
    const porNome = ordenarTitulos(titulos, { ordem: "nome" });
    expect(porNome[0]!.nome.localeCompare(porNome[1]!.nome, "pt-BR")).toBeLessThanOrEqual(0);
    expect(ordenarTitulos(titulos, { ordem: "rendimento" })).toHaveLength(titulos.length);
    expect(ordenarTitulos(titulos, { ordem: "aplicacao", dir: "asc" })[0]!.dataAplicacao <= HOJE).toBe(true);
  });

  it("escada de vencimentos: um degrau por mês, em ordem, sem data no fim", () => {
    const escada = escadaDeVencimentos(titulos, HOJE);
    const meses = escada.map((d) => d.mes);
    expect(meses.at(-1)).toBe("sem");
    expect(meses.slice(0, -1)).toEqual([...meses.slice(0, -1)].sort());
    expect(escada.find((d) => d.passado)?.titulos[0]!.nome).toBe("CDB Prefixado 12,4% (vencido)");
    const soma = escada.reduce((s, d) => s + d.titulos.length, 0);
    expect(soma).toBe(titulos.length);
    expect(
      escadaDeVencimentos(
        titulos.filter((t) => t.vencimento),
        HOJE,
      ).at(-1)!.mes,
    ).not.toBe("sem");
  });

  it("alocação do recorte soma 100%", () => {
    const fatias = alocacaoPor(titulos, (t) => t.indexador);
    expect(fatias.reduce((s, f) => s + f.fracao, 0)).toBeCloseTo(1, 6);
    expect(fatias[0]!.fracao).toBeGreaterThanOrEqual(fatias[1]!.fracao);
    expect(alocacaoPor([], (t) => t.tipo)).toEqual([]);
  });
});
