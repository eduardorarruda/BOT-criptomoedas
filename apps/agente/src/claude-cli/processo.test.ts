import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { criarClaudeFalso, type ClaudeFalso } from "../teste/claude-falso.js";
import { criarPastaExecucao } from "./pasta.js";
import { rodarProcesso } from "./processo.js";

let falso: ClaudeFalso | undefined;
afterEach(async () => falso?.apagar());

async function rodar(corpo: string, extra: { tempoMaximoMs?: number; sinal?: AbortSignal } = {}) {
  falso = await criarClaudeFalso(corpo);
  const pasta = await criarPastaExecucao();
  const mcp = await pasta.gravar("mcp.json", JSON.stringify({ mcpServers: { zentrade: { env: {} } } }));
  const instrucoes = await pasta.gravar("i.md", "x");
  const linhas: string[] = [];
  const fim = await rodarProcesso({
    caminho: falso.caminho,
    args: ["--mcp-config", mcp, "--system-prompt-file", instrucoes],
    cwd: pasta.caminho,
    env: { PATH: `${process.execPath.replace(/\/node$/, "")}:/usr/bin:/bin` },
    entrada: "olá",
    tempoMaximoMs: extra.tempoMaximoMs ?? 10_000,
    ...(extra.sinal ? { sinal: extra.sinal } : {}),
    aoLinha: (l) => linhas.push(l),
  });
  await pasta.apagar();
  return { fim, linhas };
}

describe("rodarProcesso", () => {
  it("entrega a saída linha a linha (mesmo partida) e o código de saída", async () => {
    const { fim, linhas } = await rodar(
      `process.stdout.write('{"a":'); setTimeout(() => { process.stdout.write('1}\\r\\n\\n{"b":2}'); }, 20);
       await new Promise((r) => setTimeout(r, 60)); process.stderr.write("aviso"); process.exitCode = 3;`,
    );
    expect(linhas).toEqual(['{"a":1}', '{"b":2}']);
    expect(fim).toMatchObject({ codigo: 3, motivo: "normal", stderr: "aviso" });
  });

  it("prazo estourado mata o processo e diz o motivo", async () => {
    const { fim } = await rodar("await new Promise((r) => setTimeout(r, 30_000));", { tempoMaximoMs: 200 });
    expect(fim.motivo).toBe("tempo");
  });

  it("cancelar (antes ou durante) encerra com motivo cancelado", async () => {
    const controle = new AbortController();
    setTimeout(() => controle.abort(), 150);
    const { fim } = await rodar("await new Promise((r) => setTimeout(r, 30_000));", {
      sinal: controle.signal,
    });
    expect(fim.motivo).toBe("cancelado");
    const { fim: antes } = await rodar("", { sinal: AbortSignal.abort() });
    expect(antes.motivo).toBe("cancelado");
  });

  it("executável que não existe vira falha ao iniciar", async () => {
    const fim = await rodarProcesso({
      caminho: "/nao/existe/claude",
      args: [],
      cwd: tmpdir(),
      env: {},
      entrada: "",
      tempoMaximoMs: 1000,
      aoLinha: () => undefined,
    });
    expect(fim.motivo).toBe("falha_ao_iniciar");
    expect(fim.erroAoIniciar).toMatch(/ENOENT/);
  });
});
