import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { criarFonteBrapi, faixaBrapi } from "./brapi.js";

/**
 * A fixture é inventada, mas tem as mesmas chaves e nulos de uma resposta real da brapi
 * (gravada em outubro de 2026 com um ticker de teste): nenhum dado baixado fica no
 * repositório e nenhum teste vai à rede.
 */
const FIXTURE = new URL("../teste/fixtures/brapi-bvsp-5m.json", import.meta.url);
const TOKEN = "tk_segredo_123";
const DIA = 86_400_000;
const DESDE = Date.UTC(2026, 6, 1, 3); // 01/07/2026 00:00 em Brasília
const ATE = Date.UTC(2026, 6, 3, 3);
const AGORA = Date.UTC(2026, 6, 2, 13, 10);

type Chamada = { url: string; init: RequestInit | undefined };

function fetchFalso(respostas: (() => Response | Promise<Response>)[]) {
  const chamadas: Chamada[] = [];
  const fn = async (url: string | URL | Request, init?: RequestInit) => {
    chamadas.push({ url: String(url), init });
    const proxima = respostas.shift();
    if (!proxima) throw new Error("chamada a mais");
    return proxima();
  };
  return { fetch: fn as typeof fetch, chamadas };
}

const json =
  (corpo: unknown, status = 200, cabecalhos: Record<string, string> = {}) =>
  () =>
    new Response(JSON.stringify(corpo), {
      status,
      headers: { "content-type": "application/json", ...cabecalhos },
    });

async function fixture() {
  return JSON.parse(await readFile(FIXTURE, "utf8")) as unknown;
}

function fonte(f: ReturnType<typeof fetchFalso>, esperas: number[] = [], token = TOKEN) {
  return criarFonteBrapi({
    token,
    fetch: f.fetch,
    agora: () => AGORA,
    esperar: async (ms) => {
      esperas.push(ms);
    },
  });
}

describe("fonte brapi (^BVSP → WIN-IBOV)", () => {
  it("lê a resposta gravada: candles em pontos, nulos ignorados, só a janela pedida", async () => {
    const f = fetchFalso([json(await fixture())]);
    const lote = await fonte(f).buscar({ intervalo: "5m", desde: DESDE, ate: ATE });
    expect(f.chamadas).toHaveLength(1);
    const { url, init } = f.chamadas[0]!;
    expect(url).toBe("https://brapi.dev/api/quote/%5EBVSP?range=2d&interval=5m");
    expect(url).not.toContain(TOKEN);
    expect(new Headers(init?.headers).get("authorization")).toBe(`Bearer ${TOKEN}`);
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(lote.ignorados).toBe(1);
    expect(lote.candles).toHaveLength(15);
    const [primeiro] = lote.candles;
    expect(primeiro?.abertura).toBe(Date.UTC(2026, 6, 1, 13, 0));
    expect(primeiro?.fechamento).toBe(Date.UTC(2026, 6, 1, 13, 5) - 1);
    expect(primeiro?.abre.toString()).toBe("128000");
    expect(primeiro?.maxima.toString()).toBe("128027.5");
    const artefato = lote.candles.find((k) => k.abertura === Date.UTC(2026, 6, 1, 14, 5));
    expect(artefato?.maxima.toString()).toBe("128312.12");
    expect(artefato?.fecha.toString()).toBe("128300.4");
    expect(lote.candles.every((k, i, a) => i === 0 || k.abertura > a[i - 1]!.abertura)).toBe(true);
  });

  it("recorta pela janela: 'ate' exclusivo", async () => {
    const f = fetchFalso([json(await fixture())]);
    const lote = await fonte(f).buscar({ intervalo: "5m", desde: DESDE, ate: DESDE + DIA });
    expect(lote.candles).toHaveLength(14);
  });

  it("1h e 15m pedem o intervalo certo à brapi", async () => {
    const vazio = { results: [{ symbol: "^BVSP", historicalDataPrice: [] }] };
    const f = fetchFalso([json(vazio), json(vazio)]);
    await fonte(f).buscar({ intervalo: "1h", desde: DESDE, ate: ATE });
    await fonte(f).buscar({ intervalo: "15m", desde: DESDE, ate: ATE });
    expect(f.chamadas.map((c) => new URL(c.url).searchParams.get("interval"))).toEqual(["1h", "15m"]);
  });

  it("escolhe a menor faixa (range) que cobre desde 'desde' até agora", () => {
    const agora = Date.UTC(2026, 9, 17, 12);
    expect(faixaBrapi(agora - 0.5 * DIA, agora)).toBe("1d");
    expect(faixaBrapi(agora - 4 * DIA, agora)).toBe("5d");
    expect(faixaBrapi(agora - 6.5 * DIA, agora)).toBe("7d");
    expect(faixaBrapi(agora - 20 * DIA, agora)).toBe("1mo");
    expect(faixaBrapi(agora - 60 * DIA, agora)).toBe("3mo");
    expect(faixaBrapi(agora - 300 * DIA, agora)).toBe("1y");
    expect(faixaBrapi(agora - 5000 * DIA, agora)).toBe("max");
  });

  it("sem BRAPI_TOKEN não vai à rede e explica o que fazer", async () => {
    const f = fetchFalso([]);
    await expect(fonte(f, [], "").buscar({ intervalo: "5m", desde: DESDE, ate: ATE })).rejects.toThrow(
      /BRAPI_TOKEN/,
    );
    expect(f.chamadas).toHaveLength(0);
  });

  it("401: token recusado, sem nova tentativa e sem mostrar o token", async () => {
    const f = fetchFalso([
      json({ error: true, message: `Token ${TOKEN} inválido`, code: "INVALID_TOKEN" }, 401),
    ]);
    const erro = await fonte(f)
      .buscar({ intervalo: "5m", desde: DESDE, ate: ATE })
      .catch((e: Error) => e);
    expect(erro).toBeInstanceOf(Error);
    expect((erro as Error).message).toMatch(/recusou o token/);
    expect((erro as Error).message).not.toContain(TOKEN);
    expect(f.chamadas).toHaveLength(1);
  });

  it("intervalo fora do plano: repassa a mensagem da brapi e lembra que intradiário exige o plano Pro", async () => {
    const corpo = { error: true, message: `O intervalo 5m não está disponível no seu plano (${TOKEN})` };
    const f = fetchFalso([json(corpo, 400)]);
    const erro = (await fonte(f)
      .buscar({ intervalo: "5m", desde: DESDE, ate: ATE })
      .catch((e: Error) => e)) as Error;
    expect(erro.message).toMatch(/não está disponível no seu plano/);
    expect(erro.message).toMatch(/plano Pro/);
    expect(erro.message).not.toContain(TOKEN);
    expect(erro.message).toContain("[oculto]");
  });

  it("403 e 404 também param na hora, com explicação", async () => {
    const f = fetchFalso([json({}, 403), json({}, 404)]);
    await expect(fonte(f).buscar({ intervalo: "5m", desde: DESDE, ate: ATE })).rejects.toThrow(/plano Pro/);
    await expect(fonte(f).buscar({ intervalo: "5m", desde: DESDE, ate: ATE })).rejects.toThrow(
      /não encontrou/,
    );
  });

  it("429 respeita o Retry-After e tenta de novo", async () => {
    const esperas: number[] = [];
    const f = fetchFalso([json({}, 429, { "retry-after": "2" }), json(await fixture())]);
    const lote = await fonte(f, esperas).buscar({ intervalo: "5m", desde: DESDE, ate: ATE });
    expect(esperas).toEqual([2000]);
    expect(lote.candles.length).toBeGreaterThan(0);
  });

  it("Retry-After absurdo é limitado a 60 s", async () => {
    const esperas: number[] = [];
    const f = fetchFalso([json({}, 429, { "retry-after": "3600" }), json(await fixture())]);
    await fonte(f, esperas).buscar({ intervalo: "5m", desde: DESDE, ate: ATE });
    expect(esperas).toEqual([60_000]);
  });

  it("5xx e falha de rede: recua exponencialmente e desiste depois de 4 tentativas", async () => {
    const esperas: number[] = [];
    const f = fetchFalso([
      () => Promise.reject(new TypeError("fetch failed")),
      json({}, 502),
      json({}, 503),
      json({}, 500),
    ]);
    await expect(fonte(f, esperas).buscar({ intervalo: "5m", desde: DESDE, ate: ATE })).rejects.toThrow(
      /a brapi falhou \(código 500\)/,
    );
    expect(esperas).toEqual([1000, 2000, 4000]);
    expect(f.chamadas).toHaveLength(4);
  });

  it("rede fora em todas as tentativas vira mensagem clara", async () => {
    const falha = () => Promise.reject(new DOMException("tempo esgotado", "TimeoutError"));
    const f = fetchFalso([falha, falha, falha, falha]);
    await expect(fonte(f).buscar({ intervalo: "5m", desde: DESDE, ate: ATE })).rejects.toThrow(
      /não foi possível falar com a brapi/,
    );
  });

  it("429 até o fim: avisa do limite de consultas", async () => {
    const f = fetchFalso([json({}, 429), json({}, 429), json({}, 429), json({}, 429)]);
    await expect(fonte(f).buscar({ intervalo: "5m", desde: DESDE, ate: ATE })).rejects.toThrow(
      /limite de consultas/,
    );
  });

  it("resposta fora do formato esperado é recusada pelo Zod", async () => {
    const f = fetchFalso([
      json({ results: [] }),
      json({ results: [{ symbol: "^BVSP", historicalDataPrice: [{ date: "ontem" }] }] }),
      () => new Response("<html>", { status: 200 }),
    ]);
    for (let i = 0; i < 3; i++)
      await expect(fonte(f).buscar({ intervalo: "5m", desde: DESDE, ate: ATE })).rejects.toThrow(
        /formato inesperado/,
      );
  });

  it("candle com máxima abaixo da mínima é ignorado, não gravado", async () => {
    const corpo = {
      results: [
        {
          symbol: "^BVSP",
          historicalDataPrice: [
            { date: DESDE / 1000 + 7 * 3600, open: 10, high: 9, low: 11, close: 10, volume: 0 },
            { date: DESDE / 1000 + 7 * 3600 + 300, open: 10, high: 12, low: 9, close: 11 },
          ],
        },
      ],
    };
    const f = fetchFalso([json(corpo)]);
    const lote = await fonte(f).buscar({ intervalo: "5m", desde: DESDE, ate: ATE });
    expect(lote.ignorados).toBe(1);
    expect(lote.candles).toHaveLength(1);
    expect(lote.candles[0]?.volume.toString()).toBe("0");
  });
});
