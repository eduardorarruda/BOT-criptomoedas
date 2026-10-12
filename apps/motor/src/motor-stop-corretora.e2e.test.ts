import type { ResultadoProtecao } from "@zentrade/contratos";
import { dec, posicaoDe, precoAlvo, precoStop } from "@zentrade/dominio";
import { describe, expect, it } from "vitest";
import { ESTRATEGIA_COM_SAIDA, MIN, montarCenario, NA_SAIDA } from "./teste/cenario.js";
import { candle } from "./teste/candles.js";

/** Compra a 94: stop 2% (92,12), alvo líquido 1% e limite 1% abaixo do stop (padrão de 100 bps). */
const STOP = precoStop(dec(94), 0.02); // 92.12
const LIMITE = dec("91.19"); // 92,12 × 0,99 = 91,1988, para baixo no passo de 0,01
const ALVO = precoAlvo(dec(94), 0.01, 0.001).toDecimalPlaces(2, 0); // para cima no passo de 0,01

function cenario(o: Parameters<typeof montarCenario>[0] = {}) {
  const c = montarCenario({ protecaoNaCorretora: true, ...o });
  const protecoes = c.deps.protecoes!;
  /** Fecha um minuto com mínima/máxima próprias (o papel dispara a proteção por elas). */
  let proximo = Date.UTC(2026, 9, 10, 13, 0);
  const minuto = async (fecha: string, extremos: { minima?: string; maxima?: string; abre?: string }) => {
    const base = candle(proximo, fecha, MIN, extremos);
    const k = extremos.abre ? { ...base, abre: dec(extremos.abre) } : base;
    proximo += MIN;
    c.relogio.definir(Math.max(c.relogio.agora(), k.fechamento + 1));
    c.papel.alimentar("BTCUSDT", "1m", k);
    await c.aoVivo.ocioso();
  };
  const posicao = async () => posicaoDe(await c.ordens.execucoes("r1"));
  return { ...c, protecoes, minuto, posicao };
}

describe("stop na corretora: colocado depois da compra", () => {
  it("compra executada → OCO no livro com o stop e o alvo efetivos e o limite abaixo do stop", async () => {
    const c = cenario();
    await c.aoVivo.iniciar();
    await c.fecharIntervalo(94);
    const viva = await c.protecoes.viva("r1");
    expect(viva?.estado).toBe("ATIVA");
    expect(viva?.stop.equals(STOP)).toBe(true);
    expect(viva?.limite.equals(LIMITE)).toBe(true);
    expect(viva?.alvo?.equals(ALVO)).toBe(true);
    expect(viva?.quantidade.equals((await c.posicao()).quantidade)).toBe(true);
    expect(c.papel.saldoBloqueado("BTC").equals(viva!.quantidade)).toBe(true);
    const evento = c.eventos.doTipo("posicao").at(-1);
    expect(evento?.protecaoCorretora).toMatchObject({ estado: "ATIVA", stop: "92.12", limite: "91.19" });
  });

  it("o limite abaixo do stop é configurável (stopLimiteBps)", async () => {
    const c = cenario({ stopLimiteBps: 50 });
    await c.aoVivo.iniciar();
    await c.fecharIntervalo(94);
    expect((await c.protecoes.viva("r1"))?.limite.toFixed()).toBe("91.65"); // 92,12 × 0,995 = 91,6594
  });

  it("sem compra, nada vai para a corretora", async () => {
    const c = cenario();
    await c.aoVivo.iniciar();
    await c.fecharIntervalo(96);
    expect(await c.protecoes.ultima("r1")).toBeNull();
  });
});

describe("stop na corretora: execução detectada uma vez só", () => {
  it("a mínima do minuto bate no stop (fechamento acima): a venda da corretora é gravada e o robô não vende de novo", async () => {
    const c = cenario();
    await c.aoVivo.iniciar();
    await c.fecharIntervalo(94);
    await c.minuto("93", { minima: "92" });
    expect((await c.posicao()).quantidade.isZero()).toBe(true);
    const vendas = c.ordensEnviadas().filter((o) => o.ordem.lado === "VENDA");
    expect(vendas).toHaveLength(1);
    expect(vendas[0]?.resultado?.execucoes[0]?.preco.equals(STOP)).toBe(true);
    const decisoes = c.decisoes.todas();
    const venda = decisoes.find((d) => d.sinal.acao === "VENDER");
    expect(venda?.estado).toBe("executada");
    expect(venda?.sinal).toMatchObject({ motivo: "stop" });
    expect(venda?.sinal.explicacao).toMatch(/corretora/);
    expect(decisoes[0]?.desfecho?.resultado.lt(0)).toBe(true);
    expect((await c.protecoes.ultima("r1"))?.estado).toBe("EXECUTADA");
    await c.minuto("91", { minima: "90" });
    await c.fecharIntervalo(93);
    expect(c.ordensEnviadas().filter((o) => o.ordem.lado === "VENDA")).toHaveLength(1);
    expect(c.decisoes.todas().filter((d) => d.sinal.acao === "VENDER")).toHaveLength(1);
  });

  it("stop tocado também no fechamento: só a venda da corretora, nenhuma ordem a mercado", async () => {
    const c = cenario();
    await c.aoVivo.iniciar();
    await c.fecharIntervalo(94);
    await c.minuto("91.5", { minima: "91.4" });
    expect(c.ordensEnviadas().map((o) => o.ordem.lado)).toEqual(["COMPRA", "VENDA"]);
    expect((await c.posicao()).quantidade.isZero()).toBe(true);
  });

  it("a máxima do minuto chega ao alvo: vende no alvo pela corretora", async () => {
    const c = cenario();
    await c.aoVivo.iniciar();
    await c.fecharIntervalo(94);
    await c.minuto("94.5", { maxima: ALVO.plus(0.05).toFixed(2) });
    expect((await c.posicao()).quantidade.isZero()).toBe(true);
    const venda = c.decisoes.todas().find((d) => d.sinal.acao === "VENDER");
    expect(venda?.sinal).toMatchObject({ motivo: "alvo" });
    expect(c.decisoes.todas()[0]?.desfecho?.resultado.gt(0)).toBe(true);
  });

  it("parada total ligada: a proteção segue no livro e o stop dela executa", async () => {
    const c = cenario();
    await c.aoVivo.iniciar();
    await c.fecharIntervalo(94);
    c.robos.pausar();
    await c.minuto("93", { minima: "92" });
    expect((await c.posicao()).quantidade.isZero()).toBe(true);
  });
});

describe("stop na corretora: o robô vende por conta própria", () => {
  it("venda pela regra de saída: cancela a proteção antes e vende a posição (sem vender em dobro)", async () => {
    const c = cenario({ estrategia: ESTRATEGIA_COM_SAIDA });
    await c.aoVivo.iniciar();
    await c.fecharIntervalo(94);
    await c.fecharIntervalo(NA_SAIDA);
    expect(c.ordensEnviadas().map((o) => o.ordem.lado)).toEqual(["COMPRA", "VENDA"]);
    expect((await c.posicao()).quantidade.isZero()).toBe(true);
    expect((await c.protecoes.ultima("r1"))?.estado).toBe("CANCELADA");
    expect(c.papel.saldoBloqueado("BTC").isZero()).toBe(true);
    expect((await c.papel.saldoLivre("BTC")).isZero()).toBe(true);
  });

  it("gap abaixo do limite (o stop-limit disparou e não executou): o robô cancela e vende a mercado", async () => {
    const c = cenario();
    await c.aoVivo.iniciar();
    await c.fecharIntervalo(94);
    await c.minuto("90", { abre: "90", minima: "89.5", maxima: "90.5" });
    expect(c.ordensEnviadas().map((o) => o.ordem.lado)).toEqual(["COMPRA", "VENDA"]);
    const venda = c.ordensEnviadas()[1];
    expect(venda?.ordem.idCliente).not.toBe((await c.protecoes.ultima("r1"))?.ids.stop);
    expect((await c.posicao()).quantidade.isZero()).toBe(true);
    expect((await c.protecoes.ultima("r1"))?.estado).toBe("CANCELADA");
  });

  it("a proteção executou entre a conferência e a venda do robô: o cancelamento revela e não sai ordem a mercado", async () => {
    const c = cenario();
    await c.aoVivo.iniciar();
    await c.fecharIntervalo(94);
    const consultar = c.papel.consultarProtecao.bind(c.papel);
    // Conferência atrasada: a corretora ainda diz ATIVA, mas o stop já executou.
    c.papel.consultarProtecao = async (s, ids) => {
      const r = await consultar(s, ids);
      return r
        ? ({
            ...r,
            estado: "ATIVA",
            pernas: r.pernas.map((p) => ({ ...p, ordem: { ...p.ordem, estado: "PENDENTE", execucoes: [] } })),
          } satisfies ResultadoProtecao)
        : r;
    };
    await c.minuto("91.5", { minima: "91.4" });
    expect(c.ordensEnviadas().map((o) => o.ordem.lado)).toEqual(["COMPRA", "VENDA"]);
    expect(c.ordensEnviadas()[1]?.ordem.idCliente).toBe((await c.protecoes.ultima("r1"))?.ids.stop);
    expect((await c.posicao()).quantidade.isZero()).toBe(true);
  });

  it("cancelamento sem resposta: a venda do robô não sai (a proteção segue valendo) e tenta de novo no minuto seguinte", async () => {
    const c = cenario();
    await c.aoVivo.iniciar();
    await c.fecharIntervalo(94);
    const cancelar = c.papel.cancelarProtecao.bind(c.papel);
    let falhar = true;
    c.papel.cancelarProtecao = async (s, ids) => {
      if (falhar) throw new Error("tempo esgotado");
      return cancelar(s, ids);
    };
    await c.minuto("90", { abre: "90", minima: "89.5", maxima: "90.5" });
    expect(c.ordensEnviadas()).toHaveLength(1);
    expect(c.decisoes.todas().at(-1)?.estado).toBe("falhou");
    falhar = false;
    await c.minuto("90", { abre: "90", minima: "89.8", maxima: "90.2" });
    expect(c.ordensEnviadas().map((o) => o.ordem.lado)).toEqual(["COMPRA", "VENDA"]);
    expect((await c.posicao()).quantidade.isZero()).toBe(true);
  });
});

describe("stop na corretora: reinício e reconciliação", () => {
  it("a proteção que está no livro é conferida na partida, não colocada de novo", async () => {
    const c = cenario();
    await c.aoVivo.iniciar();
    await c.fecharIntervalo(94);
    const antes = await c.protecoes.viva("r1");
    await c.reiniciar();
    await c.fecharMinuto(93.5);
    expect(c.protecoes.todas()).toHaveLength(1);
    expect((await c.protecoes.viva("r1"))?.ids).toEqual(antes?.ids);
  });

  it("o stop executou com o motor fora do ar: a partida grava a venda e o desfecho", async () => {
    const c = cenario();
    await c.aoVivo.iniciar();
    await c.fecharIntervalo(94);
    await c.aoVivo.parar();
    c.relogio.definir(c.relogio.agora() + MIN);
    c.papel.alimentar("BTCUSDT", "1m", candle(c.relogio.agora(), "93", MIN, { minima: "92" }));
    await c.reiniciar();
    expect((await c.posicao()).quantidade.isZero()).toBe(true);
    expect(c.decisoes.todas()[0]?.desfecho?.resultado.lt(0)).toBe(true);
    expect((await c.protecoes.ultima("r1"))?.estado).toBe("EXECUTADA");
  });

  it("a proteção sumiu do livro (cancelada por fora): é marcada e colocada de novo", async () => {
    const c = cenario();
    await c.aoVivo.iniciar();
    await c.fecharIntervalo(94);
    const primeira = await c.protecoes.viva("r1");
    await c.papel.cancelarProtecao("BTCUSDT", primeira!.ids);
    await c.fecharMinuto(93.5);
    expect(c.protecoes.todas().map((p) => p.estado)).toEqual(["CANCELADA", "ATIVA"]);
    expect(c.papel.saldoBloqueado("BTC").equals(primeira!.quantidade)).toBe(true);
  });

  it("reservada e o motor caiu antes de enviar (PENDENTE que não consta): coloca outra", async () => {
    const c = cenario();
    await c.aoVivo.iniciar();
    await c.fecharIntervalo(94);
    const viva = await c.protecoes.viva("r1");
    await c.papel.cancelarProtecao("BTCUSDT", viva!.ids);
    await c.protecoes.atualizar(viva!.ids.lista, "PENDENTE");
    const consultar = c.papel.consultarProtecao.bind(c.papel);
    c.papel.consultarProtecao = async (s, ids) => (ids.lista === viva!.ids.lista ? null : consultar(s, ids));
    await c.fecharMinuto(93.5);
    expect(c.protecoes.todas().map((p) => p.estado)).toEqual(["REJEITADA", "ATIVA"]);
  });
});

describe("stop na corretora: o que dá errado aparece", () => {
  it("corretora recusa a proteção: evento de risco uma vez e não insiste a cada minuto", async () => {
    const c = cenario();
    let tentativas = 0;
    c.papel.colocarProtecao = async (p) => {
      tentativas++;
      return {
        estado: "REJEITADA",
        idCorretora: null,
        pernas: [
          {
            perna: "stop",
            ordem: { idCliente: p.ids.stop, idCorretora: null, estado: "REJEITADA", execucoes: [] },
          },
        ],
        motivo: "A Binance recusou a requisição (código -1013: Filter failure: PERCENT_PRICE_BY_SIDE).",
      };
    };
    await c.aoVivo.iniciar();
    await c.fecharIntervalo(94);
    await c.fecharMinuto(93.8);
    await c.fecharMinuto(93.7);
    expect(tentativas).toBe(1);
    const riscos = c.eventos.doTipo("risco").filter((e) => e.barreira.codigo === "protecao_recusada");
    expect(riscos).toHaveLength(1);
    expect(riscos[0]?.barreira.mensagem).toMatch(/PERCENT_PRICE/);
    expect(c.eventos.doTipo("posicao").at(-1)?.protecaoCorretora?.estado).toBe("REJEITADA");
  });

  it("erro na corretora ao conferir não para a vigia do robô: o stop ainda vende no fechamento", async () => {
    const c = cenario();
    await c.aoVivo.iniciar();
    await c.fecharIntervalo(94);
    c.papel.consultarProtecao = async () => {
      throw new Error("Binance fora do ar");
    };
    await c.minuto("90", { abre: "90", minima: "89.5", maxima: "90.5" });
    expect((await c.posicao()).quantidade.isZero()).toBe(true);
    expect(c.erros.some((e) => /proteção/.test(e.msg))).toBe(true);
  });
});
