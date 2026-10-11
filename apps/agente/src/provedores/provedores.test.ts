import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dec } from "@zentrade/dominio";
import { describe, expect, it, vi } from "vitest";
import { resolverClaude } from "../claude-cli/resolver.js";
import { pedidoExemplo, USUARIO_TESTE } from "../teste/pedido.js";
import { AnalistaPorPessoa, configComPadrao, ErroProvedorIndisponivel } from "./analista-por-pessoa.js";
import { MODELOS_SUGERIDOS } from "./modelos.js";

const resposta = {
  proposta: {
    acao: "aguardar" as const,
    confianca: 0,
    tamanhoRelativo: 0,
    justificativa: "x",
    riscos: [],
    fontes: [],
  },
  custoUsd: dec(0),
};

describe("AnalistaPorPessoa", () => {
  it("manda para o provedor da pessoa, com o modelo e a conta dela", async () => {
    const api = { analisar: vi.fn(async (_p: unknown, _o: unknown) => resposta) };
    const cli = { analisar: vi.fn(async (_p: unknown, _o: unknown) => resposta) };
    const a = new AnalistaPorPessoa({
      api,
      cli,
      config: async () => ({ provedor: "cli", modelo: "opus", contaCli: "pessoal" }),
    });
    await a.analisar(pedidoExemplo(), { usuarioId: USUARIO_TESTE });
    expect(api.analisar).not.toHaveBeenCalled();
    expect(cli.analisar.mock.calls[0]![1]).toMatchObject({
      usuarioId: USUARIO_TESTE,
      modelo: "opus",
      contaCli: "pessoal",
    });
    const b = new AnalistaPorPessoa({
      api,
      cli,
      config: async () => ({ provedor: "api", modelo: null, contaCli: "pessoal" }),
    });
    await b.analisar(pedidoExemplo(), { usuarioId: USUARIO_TESTE });
    expect(api.analisar.mock.calls[0]![1]).toEqual({ usuarioId: USUARIO_TESTE });
  });

  it("provedor escolhido sem instalação: erro próprio (o motor não opera)", async () => {
    const a = new AnalistaPorPessoa({
      api: null,
      cli: null,
      config: async () => ({ provedor: "api", modelo: null, contaCli: null }),
    });
    await expect(a.analisar(pedidoExemplo(), { usuarioId: USUARIO_TESTE })).rejects.toBeInstanceOf(
      ErroProvedorIndisponivel,
    );
  });

  it("quem nunca escolheu fica com o padrão do serviço", async () => {
    const config = configComPadrao(
      async (u) => (u === "a" ? { provedor: "api", modelo: "m", contaCli: null } : null),
      "cli",
    );
    expect(await config("a")).toEqual({ provedor: "api", modelo: "m", contaCli: null });
    expect(await config("b")).toEqual({ provedor: "cli", modelo: null, contaCli: null });
  });

  it("sugestões de modelo para os dois provedores", () => {
    expect(MODELOS_SUGERIDOS.api[0]!.id).toBe("claude-opus-5");
    expect(MODELOS_SUGERIDOS.cli.map((m) => m.id)).toContain("sonnet");
  });
});

describe("resolverClaude", () => {
  it("acha no PATH ou pelo caminho absoluto; recusa outro nome e caminho relativo", async () => {
    const pasta = await mkdtemp(join(tmpdir(), "zt-resolver-"));
    const claude = join(pasta, "claude");
    await writeFile(claude, "#!/bin/sh\n");
    await chmod(claude, 0o755);
    await writeFile(join(pasta, "outro"), "x", { mode: 0o755 });
    expect(resolverClaude("claude", `relativa:${pasta}`)).toBe(claude);
    expect(resolverClaude(claude, undefined)).toBe(claude);
    expect(resolverClaude(join(pasta, "outro"), undefined)).toBeNull();
    expect(resolverClaude("./claude", pasta)).toBeNull();
    expect(resolverClaude("claude", "/nao/existe")).toBeNull();
    expect(resolverClaude("claude", undefined)).toBeNull();
    await rm(pasta, { recursive: true, force: true });
  });
});
