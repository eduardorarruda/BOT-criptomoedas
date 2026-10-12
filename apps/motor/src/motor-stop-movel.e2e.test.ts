import type { Estrategia } from "@zentrade/dominio";
import { dec, posicaoDe, precoEmpate } from "@zentrade/dominio";
import { describe, expect, it } from "vitest";
import { ESTRATEGIA, montarCenario } from "./teste/cenario.js";

/**
 * Stop móvel de 2% abaixo da maior máxima desde a entrada. Compra a 94: stop fixo 92,12;
 * alvo líquido de 5% (~98,9) para os candles de teste não chegarem nele.
 */
const MOVEL: Estrategia = {
  ...ESTRATEGIA,
  alvoLiquido: 0.05,
  stopMovel: { tipo: "percentual", distancia: 0.02 },
};
const EMPATE: Estrategia = { ...ESTRATEGIA, empate: { gatilho: 0.005 } };
const TEMPO: Estrategia = { ...ESTRATEGIA, tempoMaximo: 2 };

function cenario(o: Parameters<typeof montarCenario>[0] = {}) {
  const c = montarCenario({ protecaoNaCorretora: true, ...o });
  let colocadas = 0;
  const colocar = c.papel.colocarProtecao.bind(c.papel);
  c.papel.colocarProtecao = (p) => {
    colocadas++;
    return colocar(p);
  };
  return {
    ...c,
    protecoes: c.deps.protecoes!,
    colocadas: () => colocadas,
    stopNoLivro: async () => (await c.deps.protecoes!.viva("r1"))?.stop.toFixed(),
    zerada: async () => posicaoDe(await c.ordens.execucoes("r1")).quantidade.isZero(),
  };
}

describe("stop móvel: o stop efetivo sobe e a corretora acompanha", () => {
  it("cada alta troca o stop no livro uma vez; candle sem alta nova não mexe; nunca desce", async () => {
    const c = cenario({ estrategia: MOVEL });
    await c.aoVivo.iniciar();
    await c.fecharIntervalo(94);
    expect(await c.stopNoLivro()).toBe("92.12");
    expect(c.colocadas()).toBe(1);
    await c.fecharIntervalo(95); // 95 × 0,98 = 93,1
    expect(await c.stopNoLivro()).toBe("93.1");
    expect(c.colocadas()).toBe(2);
    await c.fecharIntervalo("94.5");
    await c.fecharIntervalo(94);
    expect(await c.stopNoLivro()).toBe("93.1");
    expect(c.colocadas()).toBe(2);
    await c.fecharIntervalo("95.1"); // 93,198 → 93,2 no passo, para cima
    expect(await c.stopNoLivro()).toBe("93.2");
    expect(c.colocadas()).toBe(3);
    expect(c.protecoes.todas().filter((p) => p.estado === "ATIVA")).toHaveLength(1);
  });

  it("o stop novo vai para o diário (stop efetivo da compra): sobrevive ao reinício", async () => {
    const c = cenario({ estrategia: MOVEL });
    await c.aoVivo.iniciar();
    await c.fecharIntervalo(94);
    await c.fecharIntervalo(95);
    expect(c.decisoes.todas()[0]?.protecao?.stop.toFixed()).toBe("93.1");
  });

  it("a vigia de 1 min usa o stop efetivo (sem proteção no livro, o robô vende no stop que subiu)", async () => {
    const c = montarCenario({ estrategia: MOVEL });
    await c.aoVivo.iniciar();
    await c.fecharIntervalo(94);
    await c.fecharIntervalo(95);
    await c.fecharMinuto(93); // acima do stop fixo (92,12), abaixo do efetivo (93,1)
    expect(c.ordensEnviadas().map((o) => o.ordem.lado)).toEqual(["COMPRA", "VENDA"]);
  });

  it("empate: depois da alta do gatilho o stop vai para o preço que paga as duas taxas", async () => {
    const c = cenario({ estrategia: EMPATE });
    await c.aoVivo.iniciar();
    await c.fecharIntervalo(94);
    await c.fecharIntervalo("94.6"); // +0,64% > gatilho de 0,5%
    const empate = precoEmpate(dec(94), 0.001);
    const noLivro = dec((await c.stopNoLivro()) ?? "0");
    expect(noLivro.gte(empate)).toBe(true);
    expect(noLivro.minus(empate).lt(dec("0.01"))).toBe(true);
  });

  it("saída por tempo: tira a proteção do livro e vende a mercado, como a regra de saída", async () => {
    const c = cenario({ estrategia: TEMPO });
    await c.aoVivo.iniciar();
    await c.fecharIntervalo(94);
    await c.fecharIntervalo("94.2");
    expect(c.ordensEnviadas()).toHaveLength(1);
    await c.fecharIntervalo("94.3");
    expect(c.ordensEnviadas().map((o) => o.ordem.lado)).toEqual(["COMPRA", "VENDA"]);
    expect(c.decisoes.todas().at(-1)?.sinal).toMatchObject({ acao: "VENDER", motivo: "tempo" });
    expect(await c.zerada()).toBe(true);
    expect((await c.protecoes.ultima("r1"))?.estado).toBe("CANCELADA");
    expect(c.papel.saldoBloqueado("BTC").isZero()).toBe(true);
  });

  it("saída por tempo com a parada total ligada: barrada (decisão nova, como a regra de saída)", async () => {
    const c = cenario({ estrategia: TEMPO });
    await c.aoVivo.iniciar();
    await c.fecharIntervalo(94);
    c.robos.pausar();
    await c.fecharIntervalo("94.2");
    await c.fecharIntervalo("94.3");
    expect(c.ordensEnviadas()).toHaveLength(1);
    expect(
      c.decisoes
        .todas()
        .at(-1)
        ?.risco.barreiras.map((b) => b.codigo),
    ).toEqual(["pausado"]);
  });
});

describe("stop móvel: reinício refaz o acompanhamento", () => {
  /** A mesma sequência de candles, com ou sem um reinício no meio. */
  async function sequencia(reiniciar: boolean) {
    const c = cenario({ estrategia: { ...MOVEL, tempoMaximo: 4 } });
    await c.aoVivo.iniciar();
    await c.fecharIntervalo(94);
    await c.fecharIntervalo(95);
    await c.fecharIntervalo("94.5");
    if (reiniciar) await c.reiniciar();
    await c.fecharIntervalo("95.3");
    return c;
  }

  it("o stop e a contagem de candles depois do reinício batem com o caminho ao vivo", async () => {
    const aoVivo = await sequencia(false);
    const reiniciado = await sequencia(true);
    expect(await reiniciado.stopNoLivro()).toBe(await aoVivo.stopNoLivro());
    expect(await aoVivo.stopNoLivro()).toBe("93.4"); // 95,3 × 0,98 = 93,394 → 93,4
    // Quarto candle desde a entrada nos dois caminhos: a saída por tempo sai junto.
    await aoVivo.fecharIntervalo("95.2");
    await reiniciado.fecharIntervalo("95.2");
    expect(aoVivo.decisoes.todas().at(-1)?.sinal).toMatchObject({ motivo: "tempo" });
    expect(reiniciado.decisoes.todas().at(-1)?.sinal).toMatchObject({ motivo: "tempo" });
  });

  it("reinício logo depois da alta: a vigia de 1 min já usa o stop que subiu", async () => {
    const c = montarCenario({ estrategia: MOVEL });
    await c.aoVivo.iniciar();
    await c.fecharIntervalo(94);
    await c.fecharIntervalo(95);
    await c.reiniciar();
    await c.fecharMinuto(93);
    expect(c.ordensEnviadas().map((o) => o.ordem.lado)).toEqual(["COMPRA", "VENDA"]);
  });
});
