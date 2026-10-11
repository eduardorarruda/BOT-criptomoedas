import { describe, expect, it } from "vitest";
import { z } from "zod";
import { assinarConsulta } from "./assinatura.js";
import { ClienteBinance } from "./cliente.js";
import {
  ErroConfiguracao,
  ErroCorretora,
  ErroLimiteRequisicoes,
  ErroRede,
  ErroSaldoInsuficiente,
  ErroTimestamp,
} from "./erros.js";
import { fetchFalso, json } from "./teste/fetch.js";

const SEGREDO = "segredo-de-teste";
const Ok = z.object({ ok: z.boolean() });

function criar(rotas: Parameters<typeof fetchFalso>[0], agora = { t: 1_000_000 }) {
  const fetch = fetchFalso({ "GET /api/v3/time": () => json({ serverTime: agora.t + 2_500 }), ...rotas });
  const cliente = new ClienteBinance({
    urlBase: "https://teste.invalido",
    apiKey: "chave",
    apiSecret: SEGREDO,
    fetch,
    agora: () => agora.t,
  });
  return { cliente, fetch, agora };
}

describe("cliente REST da Binance", () => {
  it("assina com timestamp corrigido pelo relógio do servidor e recvWindow 5000", async () => {
    const { cliente, fetch } = criar({
      "POST /api/v3/order": (url, init) => {
        const consulta = url.search.slice(1);
        const [semAssinatura, assinatura] = consulta.split("&signature=");
        expect(assinatura).toBe(assinarConsulta(semAssinatura!, SEGREDO));
        expect(url.searchParams.get("timestamp")).toBe("1002500");
        expect(url.searchParams.get("recvWindow")).toBe("5000");
        expect(url.searchParams.get("symbol")).toBe("BTCUSDT");
        expect(new Headers(init.headers).get("X-MBX-APIKEY")).toBe("chave");
        return json({ ok: true });
      },
    });
    await expect(cliente.assinado("POST", "/api/v3/order", { symbol: "BTCUSDT" }, Ok)).resolves.toEqual({
      ok: true,
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("-1021: ressincroniza o relógio e tenta uma vez de novo", async () => {
    const { cliente, fetch } = criar({
      "GET /api/v3/account": [
        () => json({ code: -1021, msg: "Timestamp for this request is outside of the recvWindow." }, 400),
        () => json({ ok: true }),
      ],
    });
    await expect(cliente.assinado("GET", "/api/v3/account", {}, Ok)).resolves.toEqual({ ok: true });
    const tempos = fetch.mock.calls.filter(([u]) => String(u).includes("/time"));
    expect(tempos).toHaveLength(2);
  });

  it("-1021 persistente vira ErroTimestamp com instrução", async () => {
    const { cliente } = criar({
      "GET /api/v3/account": () => json({ code: -1021, msg: "outside recvWindow" }, 400),
    });
    const erro = await cliente.assinado("GET", "/api/v3/account", {}, Ok).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ErroTimestamp);
    expect((erro as ErroTimestamp).message).toMatch(/relógio/);
    expect((erro as ErroTimestamp).codigo).toBe(-1021);
  });

  it("-2010 vira ErroSaldoInsuficiente em português", async () => {
    const { cliente } = criar({
      "POST /api/v3/order": () =>
        json({ code: -2010, msg: "Account has insufficient balance for requested action." }, 400),
    });
    const erro = await cliente.assinado("POST", "/api/v3/order", {}, Ok).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ErroSaldoInsuficiente);
    expect((erro as Error).message).toMatch(/saldo/i);
  });

  it("outros erros da Binance trazem o código e a mensagem original", async () => {
    const { cliente } = criar({
      "GET /api/v3/depth": () => json({ code: -1121, msg: "Invalid symbol." }, 400),
    });
    const erro = await cliente.publico("/api/v3/depth", { symbol: "X" }, Ok).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ErroCorretora);
    expect((erro as ErroCorretora).codigo).toBe(-1121);
    expect((erro as Error).message).toMatch(/Invalid symbol/);
  });

  it("erro HTTP sem corpo JSON também é explicado", async () => {
    const { cliente } = criar({ "GET /api/v3/depth": () => new Response("pane", { status: 503 }) });
    await expect(cliente.publico("/api/v3/depth", {}, Ok)).rejects.toThrow(/503/);
  });

  it("429: respeita o Retry-After sem chamar a rede enquanto espera", async () => {
    const agora = { t: 1_000_000 };
    const { cliente, fetch } = criar(
      {
        "GET /api/v3/depth": [
          () => json({ code: -1003, msg: "Too many" }, 429, { "Retry-After": "7" }),
          () => json({ ok: true }),
        ],
      },
      agora,
    );
    const erro = await cliente.publico("/api/v3/depth", {}, Ok).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ErroLimiteRequisicoes);
    expect((erro as ErroLimiteRequisicoes).esperaMs).toBe(7_000);
    expect((erro as ErroLimiteRequisicoes).banido).toBe(false);

    agora.t += 3_000;
    await expect(cliente.publico("/api/v3/depth", {}, Ok)).rejects.toThrow(/aguarde/i);
    expect(fetch).toHaveBeenCalledTimes(1);

    agora.t += 4_001;
    await expect(cliente.publico("/api/v3/depth", {}, Ok)).resolves.toEqual({ ok: true });
  });

  it("418: IP banido, avisa e usa espera padrão se não vier Retry-After", async () => {
    const { cliente } = criar({ "GET /api/v3/depth": () => json({ code: -1003, msg: "banned" }, 418) });
    const erro = (await cliente
      .publico("/api/v3/depth", {}, Ok)
      .catch((e: unknown) => e)) as ErroLimiteRequisicoes;
    expect(erro.banido).toBe(true);
    expect(erro.esperaMs).toBe(60_000);
    expect(erro.message).toMatch(/bani/);
  });

  it("falha de rede e tempo esgotado viram ErroRede", async () => {
    const { cliente } = criar({
      "GET /api/v3/depth": [
        () => {
          throw new TypeError("fetch failed");
        },
        () => {
          throw new DOMException("tempo", "TimeoutError");
        },
      ],
    });
    await expect(cliente.publico("/api/v3/depth", {}, Ok)).rejects.toBeInstanceOf(ErroRede);
    await expect(cliente.publico("/api/v3/depth", {}, Ok)).rejects.toThrow(/tempo/);
  });

  it("resposta fora do formato esperado é recusada na borda", async () => {
    const { cliente } = criar({ "GET /api/v3/depth": () => json({ outra: 1 }) });
    await expect(cliente.publico("/api/v3/depth", {}, Ok)).rejects.toThrow(/formato/);
  });

  it("rota privada sem chave configurada explica o que falta", async () => {
    const cliente = new ClienteBinance({ urlBase: "https://teste.invalido", fetch: fetchFalso({}) });
    await expect(cliente.assinado("GET", "/api/v3/account", {}, Ok)).rejects.toBeInstanceOf(ErroConfiguracao);
  });

  it("ressincroniza o relógio depois do intervalo configurado", async () => {
    const agora = { t: 1_000_000 };
    const { cliente, fetch } = criar({ "GET /api/v3/account": () => json({ ok: true }) }, agora);
    await cliente.assinado("GET", "/api/v3/account", {}, Ok);
    await cliente.assinado("GET", "/api/v3/account", {}, Ok);
    agora.t += 31 * 60_000;
    await cliente.assinado("GET", "/api/v3/account", {}, Ok);
    expect(fetch.mock.calls.filter(([u]) => String(u).includes("/time"))).toHaveLength(2);
  });
});
