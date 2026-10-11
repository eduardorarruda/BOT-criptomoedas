import type { Corretora, ResultadoOrdem } from "@zentrade/contratos";
import { posicaoDe } from "@zentrade/dominio";
import { describe, expect, it } from "vitest";
import { montarCenario } from "./teste/cenario.js";

describe("motor: falhas não passam em silêncio", () => {
  it("agente obrigatório fora do ar: decisão barrada com o motivo, nada enviado", async () => {
    const c = montarCenario({ agente: "falha", agenteObrigatorio: true });
    await c.aoVivo.iniciar();
    await c.fecharIntervalo(94);
    expect(c.ordensEnviadas()).toHaveLength(0);
    const [d] = c.decisoes.todas();
    expect(d?.estado).toBe("barrada");
    expect(d?.risco.barreiras[0]?.codigo).toBe("agente_indisponivel");
    expect(d?.risco.barreiras[0]?.mensagem).toMatch(/fora do ar/);
  });

  it("agente opcional fora do ar: só as regras decidem", async () => {
    const c = montarCenario({ agente: "falha", agenteObrigatorio: false });
    await c.aoVivo.iniciar();
    await c.fecharIntervalo(94);
    expect(c.ordensEnviadas()).toHaveLength(1);
    expect(c.decisoes.todas()[0]?.proposta).toBeUndefined();
  });

  it("agente propõe aguardar: decisão registrada com a justificativa, não opera", async () => {
    const c = montarCenario({ agente: "nunca_concorda" });
    await c.aoVivo.iniciar();
    await c.fecharIntervalo(94);
    expect(c.ordensEnviadas()).toHaveLength(0);
    const [d] = c.decisoes.todas();
    expect(d?.estado).toBe("registrada");
    expect(d?.risco.barreiras[0]).toMatchObject({ codigo: "agente_aguardar" });
    expect(d?.proposta?.acao).toBe("aguardar");
  });

  it("sem saldo para o mínimo da corretora: barrada com explicação", async () => {
    const c = montarCenario({ saldo: "3" });
    await c.aoVivo.iniciar();
    await c.fecharIntervalo(94);
    expect(c.ordensEnviadas()).toHaveLength(0);
    const [d] = c.decisoes.todas();
    expect(d?.estado).toBe("barrada");
    expect(d?.risco.barreiras[0]?.mensagem).toMatch(/quantidade mínima/);
  });

  it("erro no envio da ordem não é engolido: PENDENTE, decisão falhou, registro de erro", async () => {
    const c = montarCenario();
    const original = c.papel.enviarOrdemMercado.bind(c.papel);
    let falhar = true;
    c.papel.enviarOrdemMercado = async (p) => {
      if (!falhar) return original(p);
      await original(p); // a ordem entra na corretora...
      throw new Error("tempo esgotado"); // ...mas a resposta se perde
    };
    await c.aoVivo.iniciar();
    await c.fecharIntervalo(94);
    const [ordem] = c.ordensEnviadas();
    expect(ordem?.resultado?.estado).toBe("PENDENTE");
    expect(ordem?.resultado?.motivo).toMatch(/Confira/);
    expect(c.decisoes.todas()[0]?.estado).toBe("falhou");
    expect(c.erros.map((e) => e.msg)).toContain("falha ao enviar ordem: estado incerto");
    expect(c.eventos.doTipo("ordem").at(-1)?.ordem.estado).toBe("PENDENTE");

    // No candle seguinte, o robô confere a ordem incerta na corretora antes de decidir:
    // ela tinha entrado, então a posição aparece e não há compra em dobro.
    falhar = false;
    await c.fecharIntervalo(93);
    expect(c.ordensEnviadas()).toHaveLength(1);
    expect(c.ordensEnviadas()[0]?.resultado?.estado).toBe("PREENCHIDA");
    expect(posicaoDe(await c.ordens.execucoes("r1")).quantidade.gt(0)).toBe(true);
  });

  it("ordem incerta que não consta na corretora: marcada como rejeitada e o robô segue", async () => {
    const c = montarCenario();
    const original = c.papel.enviarOrdemMercado.bind(c.papel);
    let falhar = true;
    c.papel.enviarOrdemMercado = async (p) => {
      if (falhar) throw new Error("rede caiu antes de chegar");
      return original(p);
    };
    await c.aoVivo.iniciar();
    await c.fecharIntervalo(94);
    falhar = false;
    await c.fecharIntervalo(93);
    const ordens = c.ordensEnviadas();
    expect(ordens[0]?.resultado?.estado).toBe("REJEITADA");
    expect(ordens[0]?.resultado?.motivo).toMatch(/não consta/);
    expect(ordens[1]?.resultado?.estado).toBe("PREENCHIDA");
  });

  it("ordem incerta e a consulta também falha: não decide até conseguir conferir", async () => {
    const c = montarCenario();
    c.papel.enviarOrdemMercado = async () => {
      throw new Error("rede caiu");
    };
    c.papel.consultarOrdem = async () => {
      throw new Error("ainda sem rede");
    };
    await c.aoVivo.iniciar();
    await c.fecharIntervalo(94);
    await c.fecharIntervalo(93);
    expect(c.ordensEnviadas()).toHaveLength(1);
    expect(c.decisoes.todas()).toHaveLength(1);
    expect(c.erros.some((e) => /conferir a ordem incerta/.test(e.msg))).toBe(true);
  });

  it("ordem rejeitada pela corretora: decisão falhou com o motivo publicado", async () => {
    const c = montarCenario();
    c.papel.enviarOrdemMercado = async (p): Promise<ResultadoOrdem> => ({
      idCliente: p.idCliente,
      idCorretora: null,
      estado: "REJEITADA",
      execucoes: [],
      motivo: "Saldo insuficiente (código -2010).",
    });
    await c.aoVivo.iniciar();
    await c.fecharIntervalo(94);
    expect(c.decisoes.todas()[0]?.estado).toBe("falhou");
    expect(c.eventos.doTipo("ordem").at(-1)?.ordem.motivo).toMatch(/-2010/);
  });

  it("erro inesperado numa decisão vai para o registro e a saúde, e o robô continua", async () => {
    const c = montarCenario();
    const filtros = c.papel.filtros.bind(c.papel);
    let falhar = true;
    c.papel.filtros = async (s) => {
      if (falhar) throw new Error("exchangeInfo fora do ar");
      return filtros(s);
    };
    await c.aoVivo.iniciar();
    await c.fecharIntervalo(94);
    expect(c.aoVivo.nucleo.totalFalhas).toBe(1);
    expect(c.erros.some((e) => /falha ao decidir/.test(e.msg))).toBe(true);
    expect(c.eventos.doTipo("saude").at(-1)?.ok).toBe(false);
    falhar = false;
    await c.fecharIntervalo(93);
    expect(c.ordensEnviadas()).toHaveLength(1);
  });

  it("robô de outra rede não liga: uma fonte só de preço", async () => {
    const c = montarCenario();
    const testnet = { ...c.papel, rede: "testnet" } as unknown as Corretora;
    const { RoboAoVivo } = await import("./robo.js");
    await expect(new RoboAoVivo(c.robo, { ...c.deps, corretora: testnet }).iniciar()).rejects.toThrow(
      /fonte só de preço/,
    );
  });

  it("memória longa: o backfill enche o histórico até o tamanho configurado", async () => {
    const c = montarCenario({ candlesHistorico: 300, tamanhoHistorico: 250 });
    await c.aoVivo.iniciar();
    expect(c.aoVivo.nucleo.historico()).toHaveLength(250);
  });

  it("falha ao completar candles depois da queda é registrada", async () => {
    const c = montarCenario();
    await c.aoVivo.iniciar();
    c.papel.candles = async () => {
      throw new Error("REST fora do ar");
    };
    c.papel.desconectar();
    c.papel.reconectar();
    await c.aoVivo.ocioso();
    expect(c.erros.some((e) => /candles perdidos/.test(e.msg))).toBe(true);
    await c.aoVivo.parar();
    expect(c.aoVivo.conectado()).toBe(false);
  });
});
