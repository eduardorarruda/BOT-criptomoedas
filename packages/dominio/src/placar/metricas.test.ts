import { describe, expect, it } from "vitest";
import { dec } from "../dinheiro.js";
import { acertou, calcularPlacar, metricasDoPlacar, type DecisaoPlacar } from "./metricas.js";

let seq = 0;
const decisao = (
  claude: DecisaoPlacar["claude"],
  confianca: number,
  resultado: number | null,
  extra: Partial<DecisaoPlacar> = {},
): DecisaoPlacar => ({
  id: `d${++seq}`,
  em: seq,
  claude,
  confianca,
  fonte: "contrafactual",
  resultado: resultado === null ? null : dec(resultado),
  retorno: resultado === null ? null : resultado / 100,
  moeda: "USDT",
  roboId: "r1",
  roboNome: "BTC 5m",
  estrategiaId: "e1",
  estrategiaNome: "Rompimento",
  mercado: "cripto",
  ...extra,
});

/** A amostra feita à mão (veja as contas em cada teste). */
const amostra = (): DecisaoPlacar[] => [
  decisao("aprovou", 0.9, 10), // certa
  decisao("aprovou", 0.7, -4), // errada
  decisao("aprovou", 0.6, -4), // errada
  decisao("aprovou", 0.85, 2), // certa
  decisao("vetou", 0.8, -6), // veto certo: evitou −6
  decisao("vetou", 0.6, 5), // veto errado: perdeu +5
  decisao("aprovou", 0.75, null), // pendente
  decisao("vetou", 0.7, 0), // veto certo: zero não é ganho
];

describe("rótulos do placar", () => {
  it("aprovação certa = resultado líquido > 0; veto certo = contrafactual ≤ 0", () => {
    expect(acertou("aprovou", dec(0.01))).toBe(true);
    expect(acertou("aprovou", dec(0))).toBe(false);
    expect(acertou("vetou", dec(0))).toBe(true);
    expect(acertou("vetou", dec(-1))).toBe(true);
    expect(acertou("vetou", dec(1))).toBe(false);
  });
});

describe("métricas do placar (amostra feita à mão)", () => {
  const m = metricasDoPlacar(amostra());

  it("contagens, precisão das aprovações, vetos certos e acurácia", () => {
    expect(m).toMatchObject({ decisoes: 8, avaliadas: 7, pendentes: 1, moeda: "USDT", confiavel: false });
    expect(m.aprovacoes).toMatchObject({ acertos: 2, total: 4, taxa: 0.5 });
    expect(m.vetos).toMatchObject({ acertos: 2, total: 3 });
    expect(m.vetos.taxa).toBeCloseTo(2 / 3, 12);
    expect(m.acuracia).toMatchObject({ acertos: 4, total: 7 });
    expect(m.aprovacoes.intervalo?.inferior).toBeLessThan(0.5);
    expect(m.aprovacoes.intervalo?.superior).toBeGreaterThan(0.5);
  });

  it("dinheiro: o que o Claude agregou contra aprovar tudo", () => {
    const d = m.dinheiro!;
    expect(d.aprovadas.toString()).toBe("4"); // 10 − 4 − 4 + 2
    expect(d.seAprovasseTudo.toString()).toBe("3"); // 4 − 6 + 5 + 0
    expect(d.agregado.toString()).toBe("1");
    expect(d.perdasEvitadas.toString()).toBe("6");
    expect(d.ganhosPerdidos.toString()).toBe("5");
  });

  it("payoff, expectativa e o acerto necessário para empatar", () => {
    const p = m.payoff!;
    expect(p.ganhoMedio.toString()).toBe("6");
    expect(p.perdaMedia.toString()).toBe("4");
    expect(p.payoff).toBe(1.5);
    expect(p.expectativa.toString()).toBe("1");
    // com ganho médio 6 e perda média 4, empata acertando 4 ÷ (6 + 4) = 40%
    expect(p.acertoNecessario).toBeCloseTo(0.4, 12);
  });

  it("calibração: Brier e a tabela por faixa de confiança", () => {
    // (0,01 + 0,49 + 0,36 + 0,0225 + 0,04 + 0,36 + 0,09) ÷ 7
    expect(m.calibracao.brier).toBeCloseTo(1.3725 / 7, 12);
    const faixas = m.calibracao.faixas.filter((f) => f.decisoes > 0);
    expect(faixas.map((f) => [f.de, f.ate, f.decisoes, f.acerto])).toEqual([
      [0.6, 0.7, 2, 0],
      [0.7, 0.8, 2, 0.5],
      [0.8, 0.9, 2, 1],
      [0.9, 1, 1, 1],
    ]);
    expect(faixas[2]!.confiancaMedia).toBeCloseTo(0.825, 12);
    expect(m.calibracao.faixas).toHaveLength(6);
    expect(m.calibracao.faixas[0]).toMatchObject({ de: 0, ate: 0.5, decisoes: 0, acerto: null });
  });

  it("limite de confiança: o maior resultado com precisão ≥ 80% (empate fica com o menor limite)", () => {
    expect(m.limites.map((l) => [l.limite, l.aprovacoes, l.acertos, l.resultado?.toString()])).toEqual([
      [0.5, 4, 2, "4"],
      [0.55, 4, 2, "4"],
      [0.6, 4, 2, "4"],
      [0.65, 3, 2, "8"],
      [0.7, 3, 2, "8"],
      [0.75, 2, 2, "12"],
      [0.8, 2, 2, "12"],
      [0.85, 2, 2, "12"],
      [0.9, 1, 1, "10"],
      [0.95, 0, 0, "0"],
    ]);
    expect(m.limite).toMatchObject({
      limite: 0.75,
      aprovacoes: 2,
      acertos: 2,
      precisao: 1,
      poucasAmostras: true,
    });
    expect(m.limite?.resultado?.toString()).toBe("12");
  });

  it("avisa quando há menos de 30 decisões avaliadas", () => {
    expect(m.aviso).toMatch(/7 decisões avaliadas/);
    expect(m.aviso).toMatch(/30/);
  });
});

describe("casos de borda", () => {
  it("sem decisões: tudo vazio, sem divisão por zero", () => {
    const m = metricasDoPlacar([]);
    expect(m).toMatchObject({ decisoes: 0, avaliadas: 0, moeda: null, limite: null, payoff: null });
    expect(m.aprovacoes).toEqual({ acertos: 0, total: 0, taxa: null, intervalo: null });
    expect(m.calibracao.brier).toBeNull();
    expect(m.aviso).toMatch(/ainda não há/i);
    expect(m.dinheiro).toBeNull();
  });

  it("nenhum limite chega a 80%: sem sugestão", () => {
    const m = metricasDoPlacar([decisao("aprovou", 0.9, -1), decisao("aprovou", 0.8, 2)]);
    expect(m.limite).toBeNull();
  });

  it("aprovações só com ganhos: payoff sem perda média fica nulo, sem dividir por zero", () => {
    const m = metricasDoPlacar([decisao("aprovou", 0.9, 3)]);
    expect(m.payoff).toMatchObject({ payoff: null, acertoNecessario: 0 });
    expect(m.payoff?.perdaMedia.toString()).toBe("0");
  });

  it("acerto alto com payoff ruim perde dinheiro", () => {
    // 9 acertos de +1 e 1 erro de −20: 90% de precisão e resultado −11
    const lista = [
      ...Array.from({ length: 9 }, () => decisao("aprovou", 0.9, 1)),
      decisao("aprovou", 0.9, -20),
    ];
    const m = metricasDoPlacar(lista);
    expect(m.aprovacoes.taxa).toBe(0.9);
    expect(m.dinheiro?.aprovadas.toString()).toBe("-11");
    expect(m.payoff?.acertoNecessario).toBeCloseTo(20 / 21, 12);
  });

  it("moedas misturadas: sem somar dinheiro, o limite usa o retorno", () => {
    const m = metricasDoPlacar([
      decisao("aprovou", 0.9, 10),
      decisao("aprovou", 0.9, 300, { moeda: "BRL", mercado: "win" }),
    ]);
    expect(m.moeda).toBeNull();
    expect(m.dinheiro).toBeNull();
    expect(m.payoff).toBeNull();
    expect(m.limite).toMatchObject({ limite: 0.5, resultado: null });
    expect(m.limite?.retorno).toBeCloseTo(3.1, 12);
  });

  it("recusa confiança fora de [0, 1]", () => {
    expect(() => metricasDoPlacar([decisao("aprovou", 1.2, 1)])).toThrow(RangeError);
  });
});

describe("placar por robô, por estratégia, por mercado e total", () => {
  it("agrupa e mantém o total", () => {
    const lista = [
      ...amostra(),
      decisao("aprovou", 0.9, 300, {
        moeda: "BRL",
        mercado: "win",
        roboId: "r2",
        roboNome: "WIN 5m",
        estrategiaId: "e2",
        estrategiaNome: "Faixa de abertura",
      }),
    ];
    const p = calcularPlacar(lista);
    expect(p.total.decisoes).toBe(9);
    expect(p.total.moeda).toBeNull();
    expect(p.porRobo.map((g) => [g.chave, g.nome, g.metricas.decisoes])).toEqual([
      ["r1", "BTC 5m", 8],
      ["r2", "WIN 5m", 1],
    ]);
    expect(p.porEstrategia.map((g) => g.nome)).toEqual(["Rompimento", "Faixa de abertura"]);
    expect(p.porMercado.map((g) => [g.chave, g.nome, g.metricas.moeda])).toEqual([
      ["cripto", "Cripto (Binance, à vista)", "USDT"],
      ["win", "Mini índice (WIN, B3)", "BRL"],
    ]);
  });
});
