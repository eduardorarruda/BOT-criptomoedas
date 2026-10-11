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
    for (let i = 0; i < 100 && c.eventos.doTipo("saude").length < 3; i++) await esperar(10);
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

  it("bate no Redis a cada saúde (a API lê a batida para dizer se o motor está vivo)", async () => {
    const c = montarCenario();
    const batidas: number[] = [];
    const motor = new Motor(c.deps, {
      intervaloSaudeMs: 1_000,
      bater: async (em) => {
        batidas.push(em);
      },
    });
    await motor.iniciar();
    expect(batidas).toEqual([c.relogio.agora()]);
    await motor.publicarSaude();
    expect(batidas).toHaveLength(2);
    await motor.parar();
  });

  it("batida que falha vai para o registro e não derruba o motor", async () => {
    const c = montarCenario();
    const motor = new Motor(c.deps, {
      intervaloSaudeMs: 1_000,
      bater: () => Promise.reject(new Error("redis fora")),
    });
    await motor.iniciar();
    expect(c.erros.some((e) => /batida/.test(e.msg))).toBe(true);
    await motor.parar();
  });

  it("recarrega os robôs: liga o novo, desliga o pausado e reinicia o alterado", async () => {
    const c = montarCenario();
    const robos = new RobosMemoria([c.robo]);
    const preparados: string[] = [];
    const motor = new Motor(
      { ...c.deps, robos },
      { intervaloSaudeMs: 1_000, preparar: async (r) => void preparados.push(r.id) },
    );
    await motor.iniciar();
    expect(motor.ligados()).toEqual(["r1"]);

    const r2: RoboConfig = { ...c.robo, id: "r2" };
    robos.definir([c.robo, r2]);
    expect(await motor.recarregar()).toEqual({ ligados: 1, desligados: 0, falharam: 0 });
    expect(motor.ligados().sort()).toEqual(["r1", "r2"]);

    robos.definir([{ ...c.robo, modo: "observar" }]); // r1 mudou de modo; r2 saiu (pausado)
    expect(await motor.recarregar()).toEqual({ ligados: 1, desligados: 2, falharam: 0 });
    expect(motor.ligados()).toEqual(["r1"]);
    expect(await motor.recarregar()).toEqual({ ligados: 0, desligados: 0, falharam: 0 });
    expect(preparados).toEqual(["r1", "r2", "r1"]);
    await motor.parar();
    expect(motor.ligados()).toEqual([]);
  });

  it("recarga periódica e falha ao ler os robôs não derruba os que estão rodando", async () => {
    const c = montarCenario();
    const robos = new RobosMemoria([c.robo]);
    const motor = new Motor({ ...c.deps, robos }, { intervaloSaudeMs: 1_000, intervaloRecargaMs: 10 });
    await motor.iniciar();
    robos.definir([c.robo, { ...c.robo, id: "r2" }]);
    for (let i = 0; i < 100 && motor.ligados().length < 2; i++) await esperar(10);
    expect(motor.ligados()).toHaveLength(2);
    robos.ativos = () => Promise.reject(new Error("banco fora"));
    await motor.recarregar();
    expect(motor.ligados()).toHaveLength(2);
    expect(c.erros.some((e) => /recarregar/.test(e.msg))).toBe(true);
    await motor.parar();
  });
});
