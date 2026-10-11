import { describe, expect, it } from "vitest";
import { filtrarCom, validarBusca } from "../../componentes/filtros";
import { carteiraDemo } from "./demo";
import {
  buscaCarteira,
  ordemDaBusca,
  predicadosCarteira,
  resumirMoedas,
  temRealizado,
  temSaldo,
} from "./filtros";

const c = carteiraDemo(Date.UTC(2026, 9, 11));
const validar = validarBusca(buscaCarteira);
const ativos = (q: Record<string, unknown>, parcela: "total" | "robo" | "manual" = "total") =>
  filtrarCom(c.moedas, predicadosCarteira(validar(q), parcela)).map((m) => m.ativo);

describe("filtros da carteira", () => {
  it("só com saldo tira a moeda vendida inteira", () => {
    expect(ativos({})).toContain("ADA");
    expect(ativos({ saldo: true })).not.toContain("ADA");
    expect(ativos({ saldo: true })).toContain("USDT");
    expect(temSaldo(c.moedas.find((m) => m.ativo === "ADA")!)).toBe(false);
  });

  it("com resultado realizado depende da parcela", () => {
    expect(ativos({ realizado: true })).toEqual(expect.arrayContaining(["ADA", "BTC"]));
    expect(ativos({ realizado: true })).not.toContain("USDT");
    // A venda de BTC foi do robô; a de ADA, manual.
    expect(ativos({ realizado: true }, "robo")).toEqual(["BTC"]);
    expect(ativos({ realizado: true }, "manual")).toEqual(["ADA"]);
    expect(
      temRealizado(
        c.moedas.find((m) => m.ativo === "SOL")!,
        "total",
      ),
    ).toBe(false);
  });

  it("busca pela moeda e filtro de avisos", () => {
    expect(ativos({ q: "eth" })).toEqual(["ETH"]);
    expect(ativos({ avisos: true })).toEqual(["ETH"]);
  });

  it("ordem padrão é a maior fatia; moeda começa de A a Z", () => {
    expect(ordemDaBusca({})).toEqual({ coluna: "alocacao", direcao: "desc" });
    expect(ordemDaBusca({ ordem: "ativo" })).toEqual({ coluna: "ativo", direcao: "asc" });
    expect(ordemDaBusca({ ordem: "taxas", dir: "asc" })).toEqual({ coluna: "taxas", direcao: "asc" });
  });

  it("os totais das moedas filtradas batem com o resumo da API quando nada é filtrado", () => {
    for (const parcela of ["total", "robo", "manual"] as const) {
      const r = resumirMoedas(c.moedas, parcela);
      const api = c.resumo[parcela];
      expect(Number(r.valorAtual)).toBeCloseTo(Number(api.valorAtual), 6);
      expect(Number(r.resultadoLiquido)).toBeCloseTo(Number(api.resultadoLiquido), 6);
      expect(Number(r.taxas)).toBeCloseTo(Number(api.taxas), 6);
      expect(Number(r.retorno)).toBeCloseTo(Number(api.retorno), 6);
    }
  });

  it("totais de um recorte somam só aquelas moedas", () => {
    const btc = c.moedas.filter((m) => m.ativo === "BTC");
    const r = resumirMoedas(btc, "total");
    expect(r.taxas).toBe(btc[0]!.total.taxas);
    expect(resumirMoedas([], "total").retorno).toBeNull();
  });
});
