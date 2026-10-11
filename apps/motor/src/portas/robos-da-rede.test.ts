import type { RoboConfig } from "@zentrade/contratos";
import { describe, expect, it } from "vitest";
import { RobosMemoria } from "./memoria.js";
import { RobosDaRede } from "./robos-da-rede.js";

const robo = (id: string, rede: RoboConfig["rede"]) => ({ id, rede }) as RoboConfig;

describe("robôs da rede do motor", () => {
  it("o banco tem robôs de todas as redes; o motor só liga os da rede dele (nunca o real)", async () => {
    const todos = new RobosMemoria([robo("p", "papel"), robo("t", "testnet"), robo("r", "real")]);
    todos.pausar("t");
    const testnet = new RobosDaRede(todos, "testnet");
    expect((await testnet.ativos()).map((r) => r.id)).toEqual(["t"]);
    expect(await testnet.pausado("t")).toBe(true);
    expect((await new RobosDaRede(todos, "papel").ativos()).map((r) => r.id)).toEqual(["p"]);
  });
});
