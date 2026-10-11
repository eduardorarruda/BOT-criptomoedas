import { posicaoDe, precoAlvo, dec } from "@zentrade/dominio";
import { describe, expect, it } from "vitest";
import { candle } from "./teste/candles.js";
import { montarCenario, QUINZE, T0 } from "./teste/cenario.js";

describe("motor de ponta a ponta (papel + portas em memória)", () => {
  it("entrada: sinal de compra, agente concorda, risco aprova, ordem executada", async () => {
    const c = montarCenario();
    await c.aoVivo.iniciar();
    await c.fecharIntervalo(94);
    const [ordem] = c.ordensEnviadas();
    expect(ordem?.ordem.lado).toBe("COMPRA");
    expect(ordem?.resultado?.estado).toBe("PREENCHIDA");
    const [decisao] = c.decisoes.todas();
    expect(decisao?.estado).toBe("executada");
    expect(decisao?.sinal.acao).toBe("COMPRAR");
    const posicao = posicaoDe(await c.ordens.execucoes("r1"));
    expect(posicao.quantidade.gt(0)).toBe(true);
    // perda no stop (com taxas) não passa do risco por operação
    const perda = posicao.quantidade.times(
      dec(94).minus(dec(94).times(0.98)).plus(dec(94).times(0.001)).plus(dec(94).times(0.98).times(0.001)),
    );
    expect(perda.lte(10)).toBe(true);
    // a ordem aparece ao sair (PENDENTE) e de novo com a resposta da corretora
    expect(c.eventos.doTipo("ordem").map((e) => e.ordem.estado)).toEqual(["PENDENTE", "PREENCHIDA"]);
    expect(c.eventos.doTipo("decisao").at(-1)?.decisao.estado).toBe("executada");
    expect(c.eventos.doTipo("preco").length).toBeGreaterThan(0);
  });

  it("saída no alvo: o candle de 1 min que passa do alvo vende a posição inteira", async () => {
    const c = montarCenario();
    await c.aoVivo.iniciar();
    await c.fecharIntervalo(94);
    const alvo = precoAlvo(dec(94), 0.01, 0.001);
    await c.fecharMinuto(alvo.minus(0.5).toFixed(2));
    expect(c.ordensEnviadas()).toHaveLength(1);
    await c.fecharMinuto(alvo.plus(0.1).toFixed(2));
    const ordens = c.ordensEnviadas();
    expect(ordens.map((o) => o.ordem.lado)).toEqual(["COMPRA", "VENDA"]);
    const posicao = posicaoDe(await c.ordens.execucoes("r1"));
    expect(posicao.quantidade.isZero()).toBe(true);
    expect(posicao.resultadoRealizado.gt(0)).toBe(true);
    expect(c.decisoes.todas().at(-1)?.sinal.explicacao).toMatch(/alvo/);
  });

  it("saída no stop: vende sem depender do agente (mesmo obrigatório e fora do ar)", async () => {
    const c = montarCenario({ agenteObrigatorio: true });
    await c.aoVivo.iniciar();
    await c.fecharIntervalo(94);
    c.agente.trocar("falha");
    await c.fecharMinuto(92);
    expect(c.ordensEnviadas().map((o) => o.ordem.lado)).toEqual(["COMPRA", "VENDA"]);
    const venda = c.decisoes.todas().at(-1);
    expect(venda?.estado).toBe("executada");
    expect(venda?.proposta).toBeUndefined();
    expect(posicaoDe(await c.ordens.execucoes("r1")).resultadoRealizado.lt(0)).toBe(true);
  });

  it("stop proposto pelo agente, mais alto, protege a posição aberta", async () => {
    const c = montarCenario();
    c.agente.trocar({
      analisar: async () => ({
        proposta: {
          acao: "comprar",
          confianca: 0.9,
          tamanhoRelativo: 1,
          stop: "93.5",
          alvo: "90",
          justificativa: "ok",
          riscos: [],
          fontes: [],
        },
        custoUsd: dec("0.01"),
      }),
    });
    await c.aoVivo.iniciar();
    await c.fecharIntervalo(94);
    await c.fecharMinuto("93.4"); // o stop da estratégia (92,12) ainda não, o do agente sim
    expect(c.ordensEnviadas().map((o) => o.ordem.lado)).toEqual(["COMPRA", "VENDA"]);
    expect(c.decisoes.todas()[0]?.custoIaUsd?.equals(dec("0.01"))).toBe(true);
  });

  it("risco barrando: parada total lida a cada decisão, nunca em cache", async () => {
    const c = montarCenario();
    await c.aoVivo.iniciar();
    c.robos.pausar();
    await c.fecharIntervalo(94);
    expect(c.ordensEnviadas()).toHaveLength(0);
    const barrada = c.decisoes.todas()[0];
    expect(barrada?.estado).toBe("barrada");
    expect(barrada?.risco.barreiras.map((b) => b.codigo)).toContain("pausado");
    expect(c.eventos.doTipo("risco").map((e) => e.barreira.codigo)).toContain("pausado");
    c.robos.retomar();
    await c.fecharIntervalo(93);
    expect(c.ordensEnviadas()).toHaveLength(1);
  });

  it("modo sugerir: ninguém responde em 5 min, a decisão expira e nada é enviado", async () => {
    const c = montarCenario({ modo: "sugerir" });
    await c.aoVivo.iniciar();
    const antes = c.relogio.agora();
    await c.fecharIntervalo(94);
    expect(c.ordensEnviadas()).toHaveLength(0);
    expect(c.decisoes.todas()[0]?.estado).toBe("expirada");
    const [pedido] = c.aprovacao.solicitacoes();
    expect(pedido?.expiraEm).toBeGreaterThanOrEqual(antes + 5 * 60_000);
    expect(pedido?.resumo).toMatch(/Comprar .* BTCUSDT/);
    expect(c.eventos.doTipo("decisao").at(-1)?.decisao.estado).toBe("expirada");
  });

  it("modo sugerir: aprovada executa; recusada não", async () => {
    const aprova = montarCenario({
      modo: "sugerir",
      aoSolicitar: (id, d) => void d.mudarEstado(id, "aprovada"),
    });
    await aprova.aoVivo.iniciar();
    await aprova.fecharIntervalo(94);
    expect(aprova.ordensEnviadas()).toHaveLength(1);
    expect(aprova.decisoes.todas()[0]?.estado).toBe("executada");

    const recusa = montarCenario({
      modo: "sugerir",
      aoSolicitar: (id, d) => void d.mudarEstado(id, "recusada"),
    });
    await recusa.aoVivo.iniciar();
    await recusa.fecharIntervalo(94);
    expect(recusa.ordensEnviadas()).toHaveLength(0);
    expect(recusa.decisoes.todas()[0]?.estado).toBe("recusada");
  });

  it("modo sugerir: aprovada, mas a parada total ligou no meio — risco reavaliado barra", async () => {
    const c = montarCenario({
      modo: "sugerir",
      aoSolicitar: (id, d) => {
        c.robos.pausar("r1");
        void d.mudarEstado(id, "aprovada");
      },
    });
    await c.aoVivo.iniciar();
    await c.fecharIntervalo(94);
    expect(c.ordensEnviadas()).toHaveLength(0);
    expect(c.decisoes.todas()[0]?.estado).toBe("barrada");
  });

  it("modo observar: registra a decisão e não envia nada", async () => {
    const c = montarCenario({ modo: "observar" });
    await c.aoVivo.iniciar();
    await c.fecharIntervalo(94);
    expect(c.ordensEnviadas()).toHaveLength(0);
    expect(c.decisoes.todas()[0]).toMatchObject({ estado: "registrada", risco: { aprovada: true } });
  });

  it("idempotência: o mesmo candle repetido (rajada de 15) não gera duas ordens", async () => {
    const c = montarCenario();
    await c.aoVivo.iniciar();
    const repetido = candle(T0, 94, QUINZE);
    c.relogio.definir(repetido.fechamento + 1);
    for (let i = 0; i < 15; i++) c.papel.alimentar("BTCUSDT", "15m", repetido);
    await c.aoVivo.ocioso();
    expect(c.ordensEnviadas()).toHaveLength(1);
    expect(c.decisoes.todas()).toHaveLength(1);
  });

  it("dois candles de compra chegando juntos: a trava impede compra em dobro", async () => {
    const c = montarCenario();
    await c.aoVivo.iniciar();
    c.relogio.definir(T0 + 2 * QUINZE);
    c.papel.alimentar("BTCUSDT", "15m", candle(T0, 94, QUINZE));
    c.papel.alimentar("BTCUSDT", "15m", candle(T0 + QUINZE, 93, QUINZE));
    await c.aoVivo.ocioso();
    expect(c.ordensEnviadas().map((o) => o.ordem.lado)).toEqual(["COMPRA"]);
  });

  it("reconexão sem perder estado: completa os candles perdidos e mantém a posição", async () => {
    const c = montarCenario();
    await c.aoVivo.iniciar();
    await c.fecharIntervalo(94);
    c.papel.desconectar();
    expect(c.aoVivo.conectado()).toBe(false);
    const perdido = await c.fecharIntervalo("94.5"); // fecha durante a queda: não é entregue
    expect(c.aoVivo.nucleo.historico().at(-1)?.abertura).not.toBe(perdido.abertura);
    c.papel.reconectar();
    await c.aoVivo.ocioso();
    expect(c.aoVivo.conectado()).toBe(true);
    expect(c.aoVivo.nucleo.historico().at(-1)?.abertura).toBe(perdido.abertura);
    expect(c.decisoes.todas()).toHaveLength(1); // candle velho não decide
    await c.fecharMinuto(92);
    expect(c.ordensEnviadas().map((o) => o.ordem.lado)).toEqual(["COMPRA", "VENDA"]);
  });
});
