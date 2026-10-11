import { dec, posicaoDe, type Execucao } from "@zentrade/dominio";
import { describe, expect, it } from "vitest";
import { aplicarMovimento, LIVRO_VAZIO, livroDe, precoMedioDe, type Livro } from "./livro.js";
import type { Movimento } from "./tipos.js";

const mov = (
  tipo: Movimento["tipo"],
  quantidade: string,
  preco: string | null,
  taxa: string | null = "0",
): Movimento => ({
  ativo: "BTC",
  tipo,
  quantidade: dec(quantidade),
  precoUsdt: preco === null ? null : dec(preco),
  taxaUsdt: taxa === null ? null : dec(taxa),
  origem: "manual",
  em: 1,
  negociacaoId: "n",
});

const ver = (l: Livro) => ({
  quantidade: l.quantidade.toFixed(),
  custoPosicao: l.custoPosicao.toFixed(),
  precoMedio: precoMedioDe(l)?.toFixed() ?? null,
  bruto: l.realizadoBruto.toFixed(),
  taxas: l.taxas.toFixed(),
});

describe("livro de uma moeda: preço médio ponderado", () => {
  it("compra: custo = quantidade × preço; a taxa fica à parte", () => {
    const l = livroDe([mov("compra", "2", "100", "0.2")]);
    expect(ver(l)).toEqual({
      quantidade: "2",
      custoPosicao: "200",
      precoMedio: "100",
      bruto: "0",
      taxas: "0.2",
    });
    expect([l.quantidadeComprada.toFixed(), l.custoComprado.toFixed(), l.negociacoes]).toEqual([
      "2",
      "200",
      1,
    ]);
  });

  it("recompra pondera o preço médio pela quantidade", () => {
    const l = livroDe([mov("compra", "2", "100"), mov("compra", "2", "200")]);
    expect(ver(l)).toMatchObject({ quantidade: "4", custoPosicao: "600", precoMedio: "150" });
  });

  it("venda parcial realiza contra o preço médio e mantém o médio do resto", () => {
    const l = livroDe([
      mov("compra", "2", "100"),
      mov("compra", "2", "200"),
      mov("venda", "1", "300", "0.3"),
    ]);
    expect(ver(l)).toEqual({
      quantidade: "3",
      custoPosicao: "450",
      precoMedio: "150",
      bruto: "150",
      taxas: "0.3",
    });
    expect([l.quantidadeVendida.toFixed(), l.valorVendido.toFixed()]).toEqual(["1", "300"]);
  });

  it("venda total zera a posição e o custo; o médio some", () => {
    const l = livroDe([mov("compra", "2", "100"), mov("venda", "2", "90")]);
    expect(ver(l)).toEqual({
      quantidade: "0",
      custoPosicao: "0",
      precoMedio: null,
      bruto: "-20",
      taxas: "0",
    });
  });

  it("recompra depois de zerar começa um preço médio novo", () => {
    const l = livroDe([mov("compra", "1", "100"), mov("venda", "1", "120"), mov("compra", "1", "50")]);
    expect(ver(l)).toMatchObject({ precoMedio: "50", bruto: "20" });
  });

  it("venda além do comprado: o excedente não tem custo e não entra no resultado", () => {
    const l = livroDe([mov("compra", "1", "50"), mov("venda", "3", "10")]);
    expect(ver(l)).toMatchObject({ quantidade: "0", bruto: "-40" });
    expect([l.vendidoSemCusto.toFixed(), l.valorVendido.toFixed(), l.quantidadeVendida.toFixed()]).toEqual([
      "2",
      "30",
      "3",
    ]);
  });

  it("moeda gasta em taxa sai pelo custo médio, sem resultado nem taxa nova", () => {
    const l = livroDe([mov("compra", "2", "100"), mov("taxa", "0.5", null)]);
    expect(ver(l)).toEqual({
      quantidade: "1.5",
      custoPosicao: "150",
      precoMedio: "100",
      bruto: "0",
      taxas: "0",
    });
    expect(l.negociacoes).toBe(1);
  });

  it("taxa maior que a posição só consome o que há", () => {
    const l = livroDe([mov("compra", "1", "100"), mov("taxa", "2", "100")]);
    expect(ver(l)).toMatchObject({ quantidade: "0", custoPosicao: "0" });
  });

  it("sem preço em USDT, a negociação fica fora e é contada", () => {
    const l = livroDe([mov("compra", "1", null), mov("venda", "1", null)]);
    expect(l.semConversao).toBe(2);
    expect(ver(l)).toMatchObject({ quantidade: "0", custoPosicao: "0" });
  });

  it("taxa sem conversão é contada à parte, a negociação entra", () => {
    const l = aplicarMovimento(LIVRO_VAZIO, mov("compra", "1", "100", null));
    expect([l.taxasSemConversao, l.quantidade.toFixed(), l.taxas.toFixed()]).toEqual([1, "1", "0"]);
  });

  it("dá o mesmo preço médio e resultado líquido que a posição do domínio", () => {
    const execs: Execucao[] = [
      { lado: "COMPRA", preco: dec("100"), quantidade: dec("0.3"), taxaCotacao: dec("0.03"), em: 1 },
      { lado: "COMPRA", preco: dec("130"), quantidade: dec("0.7"), taxaCotacao: dec("0.091"), em: 2 },
      { lado: "VENDA", preco: dec("140"), quantidade: dec("0.4"), taxaCotacao: dec("0.056"), em: 3 },
      { lado: "COMPRA", preco: dec("90"), quantidade: dec("0.2"), taxaCotacao: dec("0.018"), em: 4 },
      { lado: "VENDA", preco: dec("150"), quantidade: dec("0.8"), taxaCotacao: dec("0.12"), em: 5 },
    ];
    const dominio = posicaoDe(execs);
    const livro = livroDe(
      execs.map((e) =>
        mov(
          e.lado === "COMPRA" ? "compra" : "venda",
          e.quantidade.toFixed(),
          e.preco.toFixed(),
          e.taxaCotacao.toFixed(),
        ),
      ),
    );
    expect(livro.quantidade.equals(dominio.quantidade)).toBe(true);
    expect(
      livro.realizadoBruto.minus(livro.taxas).toDecimalPlaces(18).equals(dominio.resultadoRealizado),
    ).toBe(true);
    expect(livro.taxas.equals(dominio.taxasPagas)).toBe(true);
  });

  it("decimal exato: 0,1 + 0,2 é 0,3", () => {
    const l = livroDe([mov("compra", "0.1", "1"), mov("compra", "0.2", "1")]);
    expect(l.quantidade.toFixed()).toBe("0.3");
  });
});
