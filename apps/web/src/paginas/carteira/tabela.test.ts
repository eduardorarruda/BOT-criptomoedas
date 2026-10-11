import type { MoedaCarteira, ParcelaCarteira, ResumoCarteira } from "@zentrade/contratos/esquemas";
import { describe, expect, it } from "vitest";
import { alternarOrdem, COLUNAS, ordenarMoedas, totalDaColuna, valorDaColuna } from "./tabela";

const parcela = (p: Partial<ParcelaCarteira> = {}): ParcelaCarteira => ({
  quantidadeComprada: "0",
  custoComprado: "0",
  quantidadeVendida: "0",
  valorVendido: "0",
  quantidade: "0",
  precoMedio: null,
  custoPosicao: "0",
  valorAtual: "0",
  resultadoRealizadoBruto: "0",
  resultadoRealizadoLiquido: "0",
  resultadoNaoRealizado: "0",
  resultadoLiquido: "0",
  taxas: "0",
  retorno: null,
  quantidadeVendidaSemCusto: "0",
  negociacoes: 0,
  semConversao: 0,
  ...p,
});

const moeda = (
  ativo: string,
  total: Partial<ParcelaCarteira>,
  extra: Partial<MoedaCarteira> = {},
): MoedaCarteira => ({
  ativo,
  preco: "1",
  referencia: false,
  saldo: { livre: "1", bloqueado: "0", total: "1" },
  valorSaldo: "1",
  quantidadeSemCusto: "0",
  valorSemCusto: "0",
  quantidadeForaDoSaldo: "0",
  alocacao: "0.1",
  robo: parcela({ quantidade: "9" }),
  manual: parcela(),
  total: parcela(total),
  avisos: [],
  ...extra,
});

const BTC = moeda("BTC", { valorAtual: "100.5", retorno: "0.1", resultadoNaoRealizado: "-2" });
const ETH = moeda("ETH", { valorAtual: "99", retorno: null, resultadoNaoRealizado: "10" });
const SOL = moeda("SOL", { valorAtual: null, retorno: "-0.5" }, { preco: null, alocacao: null });
const USDT = moeda("USDT", {}, { referencia: true, saldo: { livre: "50", bloqueado: "0", total: "50" } });

describe("tabela da carteira", () => {
  it("ordena em decimal exato; desconhecido vai para o fim nas duas direções", () => {
    const desc = ordenarMoedas([SOL, ETH, BTC], "total", { coluna: "valorAtual", direcao: "desc" });
    expect(desc.map((m) => m.ativo)).toEqual(["BTC", "ETH", "SOL"]);
    const asc = ordenarMoedas([SOL, ETH, BTC], "total", { coluna: "valorAtual", direcao: "asc" });
    expect(asc.map((m) => m.ativo)).toEqual(["ETH", "BTC", "SOL"]);
    const retorno = ordenarMoedas([ETH, SOL, BTC], "total", { coluna: "retorno", direcao: "asc" });
    expect(retorno.map((m) => m.ativo)).toEqual(["SOL", "BTC", "ETH"]);
  });

  it("ordena pela moeda em ordem alfabética e empata pelo nome", () => {
    expect(
      ordenarMoedas([ETH, BTC], "total", { coluna: "ativo", direcao: "asc" }).map((m) => m.ativo),
    ).toEqual(["BTC", "ETH"]);
    expect(
      ordenarMoedas([ETH, BTC], "total", { coluna: "taxas", direcao: "desc" }).map((m) => m.ativo),
    ).toEqual(["BTC", "ETH"]);
  });

  it("lê a parcela escolhida; a referência (USDT) só tem saldo, preço e alocação", () => {
    expect(valorDaColuna(BTC, "robo", "quantidade")).toBe("9");
    expect(valorDaColuna(USDT, "total", "quantidade")).toBe("50");
    expect(valorDaColuna(USDT, "total", "naoRealizado")).toBeNull();
    expect(valorDaColuna(USDT, "total", "alocacao")).toBe("0.1");
    expect(valorDaColuna(SOL, "total", "preco")).toBeNull();
    expect(COLUNAS.every((c) => c.dica.length > 10)).toBe(true);
  });

  it("clicar na mesma coluna inverte; coluna nova começa do maior", () => {
    expect(alternarOrdem({ coluna: "taxas", direcao: "desc" }, "taxas")).toEqual({
      coluna: "taxas",
      direcao: "asc",
    });
    expect(alternarOrdem({ coluna: "taxas", direcao: "asc" }, "taxas").direcao).toBe("desc");
    expect(alternarOrdem({ coluna: "taxas", direcao: "asc" }, "retorno")).toEqual({
      coluna: "retorno",
      direcao: "desc",
    });
    expect(alternarOrdem({ coluna: "taxas", direcao: "asc" }, "ativo")).toEqual({
      coluna: "ativo",
      direcao: "asc",
    });
  });

  it("totais vêm do resumo da parcela; colunas sem soma ficam vazias", () => {
    const resumo = {
      total: { custoPosicao: "10", valorAtual: "11", retorno: "0.1", taxas: "1" },
      robo: { custoPosicao: "3" },
    } as unknown as ResumoCarteira;
    expect(totalDaColuna(resumo, "total", "custoPosicao")).toBe("10");
    expect(totalDaColuna(resumo, "robo", "custoPosicao")).toBe("3");
    expect(totalDaColuna(resumo, "total", "precoMedio")).toBeNull();
  });
});
