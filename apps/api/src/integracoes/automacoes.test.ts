import { describe, expect, it, vi } from "vitest";
import { armazemMemoria, armazemRedis, CHAVE_AUTOMACOES, criarRegistroAutomacoes } from "./automacoes.js";

const MINUTO = 60_000;
const log = { warn: vi.fn(), error: vi.fn() };

function montar(inicio = 1_000_000_000) {
  const relogio = { t: inicio };
  const registro = criarRegistroAutomacoes({ armazem: armazemMemoria(), agora: () => relogio.t, log });
  return { relogio, registro };
}

describe("status das automações do n8n", () => {
  it("sem nenhum sinal, a lista é vazia", async () => {
    expect(await montar().registro.listar()).toEqual([]);
  });

  it("registra o último resultado e conta as falhas das últimas 24 h", async () => {
    const { relogio, registro } = montar();
    await registro.registrar("zentrade-alertas", false);
    relogio.t += 25 * 60 * MINUTO;
    await registro.registrar("zentrade-alertas", false);
    await registro.registrar("zentrade-alertas", true);
    const [alertas] = await registro.listar();
    expect(alertas).toMatchObject({
      id: "zentrade-alertas",
      ativa: true,
      ultimoResultado: "ok",
      ultimaExecucaoEm: relogio.t,
      falhas24h: 1,
    });
  });

  it("fluxo agendado sem sinal há mais de 3 intervalos aparece desligado", async () => {
    const { relogio, registro } = montar();
    await registro.registrar("zentrade-vigia-saude", true);
    relogio.t += 2 * MINUTO;
    expect((await registro.listar())[0]?.ativa).toBe(true);
    relogio.t += 2 * MINUTO;
    expect((await registro.listar())[0]?.ativa).toBe(false);
  });

  it("dado corrompido no armazém é ignorado; falha ao gravar só vai para o log", async () => {
    const armazem = {
      ler: async () => ({ "zentrade-noticias": "{quebrado", "zentrade-alertas": '{"ultimaEm":"x"}' }),
      gravar: vi.fn(async () => Promise.reject(new Error("Redis fora"))),
    };
    const registro = criarRegistroAutomacoes({ armazem, agora: () => 1, log });
    expect(await registro.listar()).toEqual([]);
    await expect(registro.registrar("zentrade-noticias", true)).resolves.toBeUndefined();
    expect(log.warn).toHaveBeenCalled();
  });

  it("no Redis, um campo por fluxo no hash zentrade:automacoes", async () => {
    const redis = { hgetall: vi.fn(async () => ({ a: "1" })), hset: vi.fn(async () => 1) };
    const armazem = armazemRedis(redis);
    expect(await armazem.ler()).toEqual({ a: "1" });
    await armazem.gravar("zentrade-alertas", "{}");
    expect(redis.hset).toHaveBeenCalledWith(CHAVE_AUTOMACOES, "zentrade-alertas", "{}");
  });
});
