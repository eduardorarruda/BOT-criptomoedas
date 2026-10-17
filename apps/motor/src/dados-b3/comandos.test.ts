import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bancoDeCandlesFalso } from "../teste/banco-candles.js";
import { criarFonteBrapi } from "./brapi.js";
import {
  executarImportacaoB3,
  executarImportacaoCsv,
  lerArgumentos,
  lerArquivoLimitado,
  type DependenciasImportacaoCsv,
} from "./comandos.js";
import type { FonteCandlesB3 } from "./fonte.js";

const FIXTURE_BRAPI = new URL("../teste/fixtures/brapi-bvsp-5m.json", import.meta.url);
const FIXTURE_MT5 = new URL("../teste/fixtures/win-mt5-5m.csv", import.meta.url);
const AGORA = Date.UTC(2026, 6, 2, 13, 3); // 02/07/2026 10:03 em Brasília

async function brapiGravada(): Promise<FonteCandlesB3> {
  const corpo = await readFile(FIXTURE_BRAPI, "utf8");
  return criarFonteBrapi({
    token: "tk",
    agora: () => AGORA,
    fetch: (async () => new Response(corpo, { status: 200 })) as typeof fetch,
    esperar: async () => undefined,
  });
}

function saida() {
  const linhas: string[] = [];
  return { escrever: (l: string) => linhas.push(l), linhas, texto: () => linhas.join("\n") };
}

describe("argumentos", () => {
  it("lê --chave valor e ignora o resto", () => {
    expect(lerArgumentos(["--desde", "2026-07-01", "solto", "--intervalo", "5m", "--sem-valor"])).toEqual({
      desde: "2026-07-01",
      intervalo: "5m",
    });
  });
});

describe("importar-candles-b3", () => {
  it("busca na fonte, grava WIN-IBOV com 15m e 1h e resume o que fez", async () => {
    const b = bancoDeCandlesFalso();
    const s = saida();
    const fonte = await brapiGravada();
    const r = await executarImportacaoB3(
      ["--fonte", "brapi", "--desde", "2026-07-01", "--ate", "2026-07-02"],
      {
        banco: b.banco,
        fontes: { brapi: () => fonte },
        agora: () => AGORA,
        escrever: s.escrever,
      },
    );
    // 15 candles válidos: 1 fora do pregão (18:30) e o de 02/07 10:00 ainda em formação às 10:03.
    expect(r.gravados).toEqual({ "5m": 13, "15m": 5, "1h": 2 });
    expect(r.foraDoPregao).toBe(1);
    expect(r.emFormacao).toBe(1);
    expect(b.de("WIN-IBOV", "5m")).toHaveLength(13);
    expect(s.texto()).toMatch(/15 candles recebidos, 1 ignorado/);
    expect(s.texto()).toMatch(/WIN-IBOV: 5m 13 · 15m 5 · 1h 2/);
    expect(s.texto()).toMatch(/2026-07-01 10:00/);
    expect(s.texto()).toMatch(/Ibovespa à vista/);
  });

  it("padrões: fonte brapi, intervalo 5m, até hoje", async () => {
    const b = bancoDeCandlesFalso();
    const pedidos: unknown[] = [];
    const fonte: FonteCandlesB3 = {
      nome: "falsa",
      simbolo: "WIN-IBOV",
      buscar: async (p) => {
        pedidos.push(p);
        return { candles: [], ignorados: 0, descricao: "falsa" };
      },
    };
    const s = saida();
    await executarImportacaoB3(["--desde", "2026-07-01"], {
      banco: b.banco,
      fontes: { brapi: () => fonte },
      agora: () => AGORA,
      escrever: s.escrever,
    });
    expect(pedidos).toEqual([
      { intervalo: "5m", desde: Date.UTC(2026, 6, 1, 3), ate: Date.UTC(2026, 6, 3, 3) },
    ]);
    expect(s.texto()).toMatch(/nenhum candle/);
  });

  it("--desde num sábado não gera aviso de fonte curta (o primeiro pregão é segunda)", async () => {
    const s = saida();
    const fonte = await brapiGravada();
    await executarImportacaoB3(["--desde", "2026-06-27"], {
      banco: bancoDeCandlesFalso().banco,
      fontes: { brapi: () => fonte },
      agora: () => AGORA,
      escrever: s.escrever,
    });
    expect(s.texto()).not.toMatch(/a fonte só tem dados/);
  });

  it("avisa quando a fonte começa depois do pedido e quando o período passa da retenção do banco", async () => {
    const b = bancoDeCandlesFalso();
    const s = saida();
    const fonte = await brapiGravada();
    await executarImportacaoB3(["--desde", "2023-01-02"], {
      banco: b.banco,
      fontes: { brapi: () => fonte },
      agora: () => AGORA,
      escrever: s.escrever,
    });
    expect(s.texto()).toMatch(/a fonte só tem dados a partir de 2026-07-01/);
    expect(s.texto()).toMatch(/mais de 3 anos/);
  });

  it("argumentos inválidos são recusados com explicação", async () => {
    const d = {
      banco: bancoDeCandlesFalso().banco,
      fontes: {},
      agora: () => AGORA,
      escrever: () => undefined,
    };
    await expect(executarImportacaoB3([], d)).rejects.toThrow(/--desde/);
    await expect(executarImportacaoB3(["--desde", "01/07/2026"], d)).rejects.toThrow(/AAAA-MM-DD/);
    await expect(executarImportacaoB3(["--desde", "2026-02-30"], d)).rejects.toThrow(/AAAA-MM-DD/);
    await expect(executarImportacaoB3(["--desde", "2026-07-01", "--intervalo", "1m"], d)).rejects.toThrow(
      /5m, 15m, 1h/,
    );
    await expect(executarImportacaoB3(["--desde", "2026-07-01", "--fonte", "yahoo"], d)).rejects.toThrow(
      /--fonte aceita/,
    );
    await expect(executarImportacaoB3(["--desde", "2026-06-05", "--ate", "2026-06-01"], d)).rejects.toThrow(
      /depois de --ate/,
    );
    await expect(executarImportacaoB3(["--desde", "2026-12-01"], d)).rejects.toThrow(/futuro/);
  });
});

describe("importar-candles-csv", () => {
  function deps(b = bancoDeCandlesFalso(), s = saida()): DependenciasImportacaoCsv & { s: typeof s } {
    return {
      banco: b.banco,
      agora: () => Date.UTC(2026, 9, 17),
      escrever: s.escrever,
      lerArquivo: (caminho) => readFile(caminho),
      base: "/",
      s,
    };
  }

  it("lê o export do MT5, grava WIN e lista as linhas ignoradas", async () => {
    const b = bancoDeCandlesFalso();
    const d = deps(b);
    const r = await executarImportacaoCsv(
      ["--simbolo", "WIN", "--intervalo", "5m", "--arquivo", FIXTURE_MT5.pathname],
      d,
    );
    // 8 candles lidos: 08:55, 18:30 e o sábado estão fora do pregão.
    expect(r.gravados["5m"]).toBe(5);
    expect(r.foraDoPregao).toBe(3);
    expect(b.de("WIN", "5m")).toHaveLength(5);
    expect(b.de("WIN", "15m")).toHaveLength(2);
    const texto = d.s.texto();
    expect(texto).toMatch(
      /formato mt5, 8 candles lidos, 1 repetido \(vale a última linha\), 7 linhas ignoradas/,
    );
    expect(texto).toMatch(/linha 7: número inválido/);
    expect(texto).toMatch(/WIN: 5m 5 · 15m 2 · 1h 1/);
  });

  it("caminho relativo vale a partir de onde o comando foi chamado", async () => {
    const d = { ...deps(), base: new URL("./", FIXTURE_MT5).pathname };
    const r = await executarImportacaoCsv(
      ["--simbolo", "WIN", "--intervalo", "5m", "--arquivo", "win-mt5-5m.csv", "--fuso", "-03:00"],
      d,
    );
    expect(r.gravados["5m"]).toBe(5);
  });

  it("mostra no máximo 20 linhas ignoradas", async () => {
    const linhas = ["data,hora,abertura,maxima,minima,fechamento,volume"];
    for (let i = 0; i < 30; i++) linhas.push("2026-07-01,10:00,x,1,1,1,1");
    const d = { ...deps(), lerArquivo: async () => Buffer.from(linhas.join("\n")) };
    await expect(
      executarImportacaoCsv(["--simbolo", "WIN", "--intervalo", "5m", "--arquivo", "a.csv"], d),
    ).rejects.toThrow(/nenhum candle válido/);
    expect(d.s.linhas.filter((l) => l.startsWith("  linha"))).toHaveLength(20);
    expect(d.s.texto()).toMatch(/e mais 10/);
  });

  it("argumentos inválidos são recusados com explicação", async () => {
    const d = deps();
    await expect(executarImportacaoCsv(["--intervalo", "5m", "--arquivo", "a"], d)).rejects.toThrow(
      /--simbolo aceita WIN, WIN-IBOV/,
    );
    await expect(executarImportacaoCsv(["--simbolo", "BTCUSDT", "--intervalo", "5m"], d)).rejects.toThrow(
      /--simbolo/,
    );
    await expect(executarImportacaoCsv(["--simbolo", "WIN", "--arquivo", "a"], d)).rejects.toThrow(
      /--intervalo/,
    );
    await expect(executarImportacaoCsv(["--simbolo", "WIN", "--intervalo", "5m"], d)).rejects.toThrow(
      /--arquivo/,
    );
    await expect(
      executarImportacaoCsv(
        ["--simbolo", "WIN", "--intervalo", "5m", "--arquivo", "a", "--fuso", "Lua/Base"],
        d,
      ),
    ).rejects.toThrow(/fuso desconhecido/);
    await expect(
      executarImportacaoCsv(
        ["--simbolo", "WIN", "--intervalo", "5m", "--arquivo", "a", "--formato", "xls"],
        d,
      ),
    ).rejects.toThrow(/--formato aceita/);
  });
});

describe("leitura do arquivo", () => {
  let pasta: string;
  beforeAll(async () => {
    pasta = await mkdtemp(join(tmpdir(), "zt-csv-"));
  });
  afterAll(async () => {
    await rm(pasta, { recursive: true, force: true });
  });

  it("lê arquivo comum dentro do limite e recusa o que passa dele, pasta ou inexistente", async () => {
    const arquivo = join(pasta, "a.csv");
    await writeFile(arquivo, "0123456789");
    expect((await lerArquivoLimitado(arquivo, 10)).toString()).toBe("0123456789");
    await expect(lerArquivoLimitado(arquivo, 9)).rejects.toThrow(/passa de/);
    await expect(lerArquivoLimitado(pasta, 10)).rejects.toThrow(/não é um arquivo/);
    await expect(lerArquivoLimitado(join(pasta, "nada.csv"), 10)).rejects.toThrow(/não existe/);
  });
});
