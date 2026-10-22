import type { LeituraCenarioDTO, PensamentoDTO } from "@zentrade/contratos/esquemas";
import { describe, expect, it } from "vitest";
import { CENARIO, numerosDoCenario, posicaoNaRegua, resumoDoRobo } from "./cenario";

const lateral: LeituraCenarioDTO = {
  cenario: "lateral",
  precoVsSma200: -0.4,
  precoVsSma400: null,
  inclinacaoSma200: 0,
  limiarInclinacao: 0.5,
  variacao7d: 0,
  janelaVariacaoHoras: 168,
  atrPct: 1,
  atrPercentil: 62,
  eficiencia: 0.1,
  texto: "x",
};

const pensamento = (extra: Partial<PensamentoDTO>): PensamentoDTO => ({
  em: 1,
  preco: "100",
  sinal: "AGUARDAR",
  posicionado: false,
  regraAvaliada: "entrada",
  condicoes: null,
  cenario: lateral,
  agente: "decide",
  explicacao: "x",
  conclusao: "Fico de fora: não é verdade que preço (100) > SMA(200) (101).",
  ...extra,
});

describe("cenário na tela", () => {
  it("cada cenário tem ícone, palavra e tom próprios: a cor não é a única pista", () => {
    const rotulos = Object.values(CENARIO).map((c) => c.rotulo);
    expect(new Set(rotulos).size).toBe(4);
    expect(new Set(Object.values(CENARIO).map((c) => c.icone)).size).toBe(4);
    expect(CENARIO.alta.tom).toBe("ganho");
    expect(CENARIO.queda.tom).toBe("perda");
  });

  it("a régua põe a média parada no centro e trava nas pontas", () => {
    expect(posicaoNaRegua(0, 0.5)).toBe(50);
    expect(posicaoNaRegua(0.5, 0.5)).toBe(75);
    expect(posicaoNaRegua(9, 0.5)).toBe(100);
    expect(posicaoNaRegua(-9, 0.5)).toBe(0);
    expect(posicaoNaRegua(null, 0.5)).toBeNull();
  });

  it("os números vêm com rótulo e ajuda; o que falta (média de 400) fica de fora", () => {
    const n = numerosDoCenario(lateral);
    expect(n.map((x) => x.chave)).toEqual(["sma200", "inclinacao", "sete-dias", "atr", "eficiencia"]);
    expect(n[0]).toMatchObject({ rotulo: "Preço × média de 200", valor: "−0,4%" });
    expect(n.find((x) => x.chave === "atr")?.valor).toBe("1,0% · p62");
  });

  it("janela de variação menor que 7 dias diz qual é", () => {
    const n = numerosDoCenario({ ...lateral, janelaVariacaoHoras: 24.9 });
    const v = n.find((x) => x.chave === "sete-dias");
    expect(v?.rotulo).toBe("Variação na janela");
    expect(v?.ajuda).toContain("25 horas");
  });

  it("resumo do robô: fora, com o motivo sem o verbo do começo", () => {
    const r = resumoDoRobo(pensamento({}));
    expect(r).toMatchObject({ situacao: "fora", rotulo: "Fora", tom: "neutro" });
    expect(r.motivo).toBe("não é verdade que preço (100) > SMA(200) (101)");
  });

  it("resumo do robô: compra, saída e posição aberta", () => {
    expect(
      resumoDoRobo(
        pensamento({ sinal: "COMPRAR", conclusao: "Compro: ok. O Claude confere antes da ordem." }),
      ).situacao,
    ).toBe("comprando");
    expect(resumoDoRobo(pensamento({ sinal: "VENDER", conclusao: "Saio pelo stop: x." })).motivo).toBe("x");
    const r = resumoDoRobo(pensamento({ posicionado: true, conclusao: "Mantenho a posição: stop em 95." }));
    expect(r).toMatchObject({ situacao: "posicionado", motivo: "stop em 95" });
  });
});
