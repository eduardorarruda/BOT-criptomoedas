import type { RoboConfig } from "@zentrade/contratos";
import { describe, expect, it } from "vitest";
import { Motor } from "./motor.js";
import { RobosMemoria } from "./portas/memoria.js";
import { montarCenario } from "./teste/cenario.js";

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("motor", () => {
  it("liga os robôs ativos, publica saúde periodicamente e desliga com graça", async () => {
    const c = montarCenario();
    const motor = new Motor(c.deps, { intervaloSaudeMs: 20 });
    expect(await motor.iniciar()).toEqual({ ligados: 1, falharam: 0 });
    await esperar(70);
    const saudes = c.eventos.doTipo("saude");
    expect(saudes.length).toBeGreaterThanOrEqual(3);
    expect(saudes.every((s) => s.ok && s.servico === "motor")).toBe(true);
    await c.fecharIntervalo(94);
    await motor.ocioso();
    expect(c.ordensEnviadas()).toHaveLength(1);
    await motor.parar();
    const total = c.eventos.doTipo("saude").length;
    expect(c.eventos.doTipo("saude").at(-1)?.ok).toBe(false);
    await esperar(50);
    expect(c.eventos.doTipo("saude")).toHaveLength(total);
  });

  it("robô que não liga é registrado, deixa a saúde ruim e não derruba os outros", async () => {
    const c = montarCenario();
    const errado: RoboConfig = { ...c.robo, id: "r2", rede: "testnet" };
    const motor = new Motor(
      { ...c.deps, robos: new RobosMemoria([c.robo, errado]) },
      { intervaloSaudeMs: 1_000 },
    );
    expect(await motor.iniciar()).toEqual({ ligados: 1, falharam: 1 });
    expect(c.erros.some((e) => /não ligou/.test(e.msg))).toBe(true);
    expect(c.eventos.doTipo("saude").at(-1)?.ok).toBe(false);
    await motor.parar();
  });

  it("conexão caída deixa a saúde ruim", async () => {
    const c = montarCenario();
    const motor = new Motor(c.deps, { intervaloSaudeMs: 1_000 });
    await motor.iniciar();
    c.papel.desconectar();
    await motor.publicarSaude();
    expect(c.eventos.doTipo("saude").at(-1)?.ok).toBe(false);
    await motor.parar();
  });
});
