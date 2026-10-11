import { CANAL_EVENTOS } from "@zentrade/contratos";
import { describe, expect, it } from "vitest";
import { BatidaRedis, CHAVE_BATIDA_MOTOR, EventosRedis, type ClienteRedis } from "./redis.js";

function redisFalso() {
  const publicados: [string, string][] = [];
  const gravados: unknown[][] = [];
  const cliente: ClienteRedis = {
    publish: async (canal, mensagem) => {
      publicados.push([canal, mensagem]);
      return 1;
    },
    set: async (...args: unknown[]) => {
      gravados.push(args);
      return "OK";
    },
  };
  return { cliente, publicados, gravados };
}

describe("Redis: eventos e batida", () => {
  it("publica cada evento em JSON no canal zentrade:eventos", async () => {
    const r = redisFalso();
    await new EventosRedis(r.cliente).publicar({ tipo: "saude", servico: "motor", ok: true, em: 5 });
    expect(r.publicados).toEqual([[CANAL_EVENTOS, '{"tipo":"saude","servico":"motor","ok":true,"em":5}']]);
  });

  it("grava a batida em ms na chave que a API lê, com validade para não mentir depois de morto", async () => {
    const r = redisFalso();
    await new BatidaRedis(r.cliente).bater(1_791_000_000_000);
    expect(CHAVE_BATIDA_MOTOR).toBe("zentrade:motor:batida");
    expect(r.gravados).toEqual([[CHAVE_BATIDA_MOTOR, "1791000000000", "EX", 3600]]);
  });
});
