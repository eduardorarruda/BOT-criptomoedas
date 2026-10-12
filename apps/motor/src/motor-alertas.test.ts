import type { RoboConfig } from "@zentrade/contratos";
import { describe, expect, it } from "vitest";
import { Motor } from "./motor.js";
import { RobosMemoria } from "./portas/memoria.js";
import type { RelogioManual } from "./relogio.js";
import { MIN, montarCenario, USUARIO } from "./teste/cenario.js";

describe("alertas do motor", () => {
  it("robô que não liga vira alerta crítico com o motivo, para a dona", async () => {
    const c = montarCenario();
    const errado: RoboConfig = { ...c.robo, id: "r2", rede: "testnet" };
    const motor = new Motor(
      { ...c.deps, robos: new RobosMemoria([c.robo, errado]) },
      { intervaloSaudeMs: 1_000 },
    );
    await motor.iniciar();
    const [alerta] = c.eventos.doTipo("alerta").map((e) => e.alerta);
    expect(alerta).toMatchObject({
      tipo: "robo_nao_ligou",
      gravidade: "critico",
      roboId: "r2",
      usuarioId: USUARIO,
      chave: "robo_nao_ligou:r2",
    });
    expect(alerta?.mensagem).toMatch(/rede "testnet"/);
    await motor.parar();
  });

  it("WebSocket fora por mais que o limite vira um alerta por queda", async () => {
    const c = montarCenario();
    const relogio = c.deps.relogio as RelogioManual;
    const motor = new Motor(c.deps, { intervaloSaudeMs: 60_000, alertaWebSocketMs: 5 * MIN });
    await motor.iniciar();
    const alertas = () => c.eventos.doTipo("alerta").map((e) => e.alerta);

    c.papel.desconectar();
    relogio.avancar(4 * MIN);
    await motor.publicarSaude();
    expect(alertas()).toHaveLength(0);

    relogio.avancar(2 * MIN);
    await motor.publicarSaude();
    await motor.publicarSaude();
    expect(alertas()).toHaveLength(1);
    expect(alertas()[0]).toMatchObject({ tipo: "websocket_fora", roboId: "r1" });
    expect(alertas()[0]?.mensagem).toContain("6 min");

    c.papel.reconectar();
    await motor.publicarSaude();
    c.papel.desconectar();
    relogio.avancar(6 * MIN);
    await motor.publicarSaude();
    expect(alertas()).toHaveLength(2);
    expect(alertas()[1]?.chave).not.toBe(alertas()[0]?.chave);
    await motor.parar();
  });

  it("queda curta que volta antes do limite não avisa", async () => {
    const c = montarCenario();
    const relogio = c.deps.relogio as RelogioManual;
    const motor = new Motor(c.deps, { intervaloSaudeMs: 60_000 });
    await motor.iniciar();
    c.papel.desconectar();
    relogio.avancar(3 * MIN);
    c.papel.reconectar();
    relogio.avancar(10 * MIN);
    await motor.publicarSaude();
    expect(c.eventos.doTipo("alerta")).toHaveLength(0);
    await motor.parar();
  });
});
