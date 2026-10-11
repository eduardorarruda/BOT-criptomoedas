import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ClienteBinance } from "./cliente.js";
import { Disjuntor, disjuntorDaRede } from "./disjuntor.js";
import { ErroLimiteRequisicoes } from "./erros.js";
import { fetchFalso, json } from "./teste/fetch.js";

const Qualquer = z.unknown();

describe("disjuntor da Binance (bloqueio por IP vale para o processo)", () => {
  it("418 num cliente bloqueia os outros que dividem o disjuntor, sem nova chamada à Binance", async () => {
    const agora = () => 1_000_000;
    const disjuntor = new Disjuntor();
    const banido = fetchFalso({
      "GET /api/v3/ping": () => json({ code: -1003, msg: "banido" }, 418, { "Retry-After": "120" }),
    });
    const outro = fetchFalso({ "GET /api/v3/ping": () => json({}) });
    const a = new ClienteBinance({ urlBase: "https://teste.invalido", fetch: banido, agora, disjuntor });
    const b = new ClienteBinance({ urlBase: "https://teste.invalido", fetch: outro, agora, disjuntor });

    await expect(a.publico("/api/v3/ping", {}, Qualquer)).rejects.toBeInstanceOf(ErroLimiteRequisicoes);
    await expect(b.publico("/api/v3/ping", {}, Qualquer)).rejects.toThrow(/aguarde 120 s/);
    expect(outro).not.toHaveBeenCalled();
  });

  it("sem disjuntor compartilhado, cada cliente tem o seu (isolamento dos testes)", async () => {
    const agora = () => 1_000_000;
    const banido = fetchFalso({ "GET /api/v3/ping": () => json({}, 429, { "Retry-After": "5" }) });
    const outro = fetchFalso({ "GET /api/v3/ping": () => json({ ok: true }) });
    const a = new ClienteBinance({ urlBase: "https://teste.invalido", fetch: banido, agora });
    const b = new ClienteBinance({ urlBase: "https://teste.invalido", fetch: outro, agora });
    await expect(a.publico("/api/v3/ping", {}, Qualquer)).rejects.toBeInstanceOf(ErroLimiteRequisicoes);
    await expect(b.publico("/api/v3/ping", {}, Qualquer)).resolves.toEqual({ ok: true });
  });

  it("um bloqueio mais curto não encurta um mais longo", () => {
    const d = new Disjuntor();
    d.bloquear(5_000);
    d.bloquear(2_000);
    expect(d.restanteMs(1_000)).toBe(4_000);
    expect(d.restanteMs(6_000)).toBe(0);
  });

  it("um disjuntor por rede no processo", () => {
    expect(disjuntorDaRede("real")).toBe(disjuntorDaRede("real"));
    expect(disjuntorDaRede("testnet")).not.toBe(disjuntorDaRede("real"));
  });
});
