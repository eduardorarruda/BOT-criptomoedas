import type { PortaAgente } from "@zentrade/contratos";
import { dec, posicaoDe, precoAlvo } from "@zentrade/dominio";
import { describe, expect, it } from "vitest";
import { AgenteFixo } from "./portas/agente-fixo.js";
import { ESTRATEGIA_COM_SAIDA, montarCenario, NA_SAIDA } from "./teste/cenario.js";

const ALVO = precoAlvo(dec(94), 0.01, 0.001);

/** Conta as chamadas ao agente. */
class Contador implements PortaAgente {
  chamadas = 0;
  constructor(public atual: PortaAgente) {}
  analisar(p: Parameters<PortaAgente["analisar"]>[0]) {
    this.chamadas++;
    return this.atual.analisar(p);
  }
}

const zerada = async (c: ReturnType<typeof montarCenario>) =>
  posicaoDe(await c.ordens.execucoes("r1")).quantidade.isZero();

describe("proteção: pausa, parada total e frequência nunca barram o stop", () => {
  it("parada total ligada: o stop vende mesmo assim", async () => {
    const c = montarCenario();
    await c.aoVivo.iniciar();
    await c.fecharIntervalo(94);
    c.robos.pausar();
    await c.fecharMinuto(92);
    expect(c.ordensEnviadas().map((o) => o.ordem.lado)).toEqual(["COMPRA", "VENDA"]);
    expect(await zerada(c)).toBe(true);
    expect(c.decisoes.todas()[1]?.estado).toBe("executada");
  });

  it("robô pausado (só ele) com posição aberta: o stop segue vigiado e vende", async () => {
    const c = montarCenario();
    await c.aoVivo.iniciar();
    await c.fecharIntervalo(94);
    c.robos.pausar("r1");
    await c.fecharMinuto(93);
    expect(c.ordensEnviadas()).toHaveLength(1);
    await c.fecharMinuto(92);
    expect(await zerada(c)).toBe(true);
  });

  it("limite de ordens por hora estourado: o stop vende", async () => {
    const c = montarCenario({ limites: { ordensPorHoraMax: 1 } });
    await c.aoVivo.iniciar();
    await c.fecharIntervalo(94);
    await c.fecharMinuto(92);
    expect(await zerada(c)).toBe(true);
  });

  it("parada total ligada: o alvo combinado na entrada também sai", async () => {
    const c = montarCenario();
    await c.aoVivo.iniciar();
    await c.fecharIntervalo(94);
    c.robos.pausar();
    await c.fecharMinuto(ALVO.plus(0.1).toFixed(2));
    expect(await zerada(c)).toBe(true);
  });

  it("parada total ligada: a saída pela regra (decisão nova) fica barrada", async () => {
    const c = montarCenario({ estrategia: ESTRATEGIA_COM_SAIDA });
    await c.aoVivo.iniciar();
    await c.fecharIntervalo(94);
    c.robos.pausar();
    await c.fecharIntervalo(NA_SAIDA);
    expect(c.ordensEnviadas()).toHaveLength(1);
    expect(
      c.decisoes
        .todas()
        .at(-1)
        ?.risco.barreiras.map((b) => b.codigo),
    ).toEqual(["pausado"]);
  });

  it("parada total ligada: a compra é barrada sem gastar uma consulta ao agente", async () => {
    const conta = new Contador(new AgenteFixo("sempre_concorda"));
    const c = montarCenario({ agente: conta });
    await c.aoVivo.iniciar();
    c.robos.pausar();
    await c.fecharIntervalo(94);
    expect(conta.chamadas).toBe(0);
    expect(c.ordensEnviadas()).toHaveLength(0);
    expect(c.decisoes.todas()[0]?.estado).toBe("barrada");
    expect(c.decisoes.todas()[0]?.risco.barreiras.map((b) => b.codigo)).toEqual(["pausado"]);
  });

  it("modo observar com posição aberta (o robô mudou de modo): o stop vende", async () => {
    const c = montarCenario();
    await c.aoVivo.iniciar();
    await c.fecharIntervalo(94);
    const observando = { ...c.robo, modo: "observar" as const };
    c.robos.definir([observando]);
    await c.aoVivo.parar();
    const { RoboAoVivo } = await import("./robo.js");
    const outro = new RoboAoVivo(observando, c.deps);
    await outro.iniciar();
    c.papel.alimentar("BTCUSDT", "1m", {
      abertura: c.relogio.agora(),
      fechamento: c.relogio.agora() + 59_999,
      abre: dec(92),
      maxima: dec(92),
      minima: dec(92),
      fecha: dec(92),
      volume: dec(1),
    });
    await outro.ocioso();
    expect(await zerada(c)).toBe(true);
    await outro.parar();
  });
});
