import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { registrarRotasPonte } from "../ponte/rotas.js";
import { SessoesPonte } from "../ponte/sessoes.js";
import { criarClaudeFalso, resultadoCli, type ClaudeFalso } from "../teste/claude-falso.js";
import { ErroClaudeCli } from "./analista-cli.js";
import {
  ErroSemToken,
  ExecutorClaude,
  MENSAGEM_TOKEN_RECUSADO,
  type FonteTokensClaude,
  type PedidoExecucao,
} from "./executor.js";
import { explicarFalha } from "./resultado.js";

const TOKEN = `sk-ant-oat01-${"T0k3n_-".repeat(13)}`;
const ANA = "7b0c8a52-1d2e-4c3b-9a8f-0e1d2c3b4a59";
const PASTA_CONTA = "/dados/claude/principal";

let app: FastifyInstance;
let url: string;
const sessoes = new SessoesPonte();
let falso: ClaudeFalso | undefined;

beforeAll(async () => {
  app = Fastify({ logger: false });
  registrarRotasPonte(app, sessoes, app.log);
  url = await app.listen({ host: "127.0.0.1", port: 0 });
});
afterAll(async () => app.close());
afterEach(async () => falso?.apagar());

/** O falso conta o que havia na pasta de configuração ao nascer (tem que estar vazia). */
const LISTA_CONFIG = `
  const dir = process.env.CLAUDE_CONFIG_DIR;
  const conteudo = dir && fs.existsSync(dir) ? fs.readdirSync(dir) : null;
  sair(Object.assign(${JSON.stringify(resultadoCli())}, { result: JSON.stringify({ dir, conteudo }) }));`;

function fonte(token: string | null): FonteTokensClaude & { erros: string[] } {
  const erros: string[] = [];
  return {
    erros,
    token: vi.fn(async () => token),
    registrarErro: vi.fn(async (_u: string, m: string) => void erros.push(m)),
  };
}

async function executor(corpo: string, tokens?: FonteTokensClaude) {
  falso = await criarClaudeFalso(corpo);
  return new ExecutorClaude(
    {
      caminho: falso.caminho,
      contas: [{ id: "principal", nome: "principal", pasta: PASTA_CONTA }],
      urlAgente: url,
      caminhoPonte: "/app/dist/ponte/bin.js",
      maxTurnos: 6,
      tetoUsd: 0.5,
      env: {
        PATH: process.env["PATH"],
        HOME: "/home/zt",
        ANTHROPIC_API_KEY: "sk-ant-api03-nao-pode-vazar",
        ANTHROPIC_AUTH_TOKEN: "nao-pode-vazar",
        ZENTRADE_CHAVE_MESTRA: "nao-pode-vazar",
        CLAUDE_CODE_OAUTH_TOKEN: "o-do-servidor-nao-vale",
      },
      ...(tokens ? { tokens } : {}),
    },
    sessoes,
  );
}

const pedido = (extra: Partial<PedidoExecucao> = {}): PedidoExecucao => ({
  usuarioId: ANA,
  ferramentas: [],
  instrucoes: "instruções",
  entrada: "oi",
  modelo: null,
  contaId: null,
  tempoMs: 10_000,
  modo: { tipo: "chat" },
  ...extra,
});

describe("login do Claude Code: o token da pessoa vem antes das contas do servidor", () => {
  it("com token: CLAUDE_CODE_OAUTH_TOKEN e um CLAUDE_CONFIG_DIR novo e vazio, sem as chaves da API", async () => {
    const tokens = fonte(TOKEN);
    const e = await executor(LISTA_CONFIG, tokens);
    const exec = await e.executar(pedido());
    const r = await falso!.recebido();
    expect(exec.credencial).toBe("token");
    expect(r.env["CLAUDE_CODE_OAUTH_TOKEN"]).toBe(TOKEN);
    for (const fora of ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "ZENTRADE_CHAVE_MESTRA"]) {
      expect(r.env[fora], fora).toBeUndefined();
    }
    const { dir, conteudo } = JSON.parse(exec.resultado!.result!) as { dir: string; conteudo: string[] };
    expect(dir).not.toBe(PASTA_CONTA);
    expect(dir.startsWith(tmpdir())).toBe(true);
    expect(conteudo).toEqual([]);
    expect(existsSync(dir)).toBe(false); // apagada no fim da execução
    expect(tokens.token).toHaveBeenCalledWith(ANA);
  });

  it("o token nunca vai na linha de comando, e as travas de segurança continuam", async () => {
    const e = await executor(`sair(${JSON.stringify(resultadoCli())});`, fonte(TOKEN));
    await e.executar(pedido());
    const { args } = await falso!.recebido();
    expect(args.join(" ")).not.toContain("sk-ant");
    expect(args).toEqual(
      expect.arrayContaining([
        "-p",
        "--restricted",
        "--strict-mcp-config",
        "--no-session-persistence",
        "--disable-slash-commands",
        "--max-turns",
        "--max-budget-usd",
      ]),
    );
    expect(args[args.indexOf("--tools") + 1]).toBe("");
    expect(args).not.toContain("--bare");
  });

  it("sem token, volta para a pasta da conta do servidor (como antes)", async () => {
    const e = await executor(LISTA_CONFIG, fonte(null));
    const exec = await e.executar(pedido());
    const r = await falso!.recebido();
    expect(exec.credencial).toBe("conta");
    expect(r.env["CLAUDE_CONFIG_DIR"]).toBe(PASTA_CONTA);
    expect(r.env["CLAUDE_CODE_OAUTH_TOKEN"]).toBeUndefined();
    expect(r.env["ANTHROPIC_API_KEY"]).toBeUndefined();
  });

  it("agente sem chave mestra (sem fonte de tokens): só as contas", async () => {
    const e = await executor(LISTA_CONFIG);
    expect((await e.executar(pedido())).credencial).toBe("conta");
  });

  it("token recusado: manda reconectar, grava o erro para a tela e não vaza o token no detalhe", async () => {
    const tokens = fonte(TOKEN);
    const e = await executor(
      `process.stderr.write("API Error: 401 authentication_error: Invalid bearer token ${TOKEN}\\n"); process.exitCode = 1;`,
      tokens,
    );
    const exec = await e.executar(pedido());
    expect(exec.falha).toMatchObject({ codigo: "autenticacao", mensagem: MENSAGEM_TOKEN_RECUSADO });
    expect(JSON.stringify(exec.falha)).not.toContain(TOKEN.slice(14));
    expect(tokens.erros).toEqual([MENSAGEM_TOKEN_RECUSADO]);
  });

  it("não decifrou o token: erro claro, sem cair para a conta do servidor", async () => {
    const tokens: FonteTokensClaude = {
      token: async () => {
        throw new Error("chave mestra mudou");
      },
      registrarErro: async () => undefined,
    };
    const e = await executor(`sair(${JSON.stringify(resultadoCli())});`, tokens);
    await expect(e.executar(pedido())).rejects.toBeInstanceOf(ErroClaudeCli);
    await expect(falso!.recebido()).rejects.toThrow(); // o CLI nem rodou
  });

  it("modo teste: só com token, 1 volta e o teto menor", async () => {
    const e = await executor(`sair(${JSON.stringify(resultadoCli())});`, fonte(TOKEN));
    const exec = await e.executar(pedido({ modo: { tipo: "teste", tetoUsd: 0.05 } }));
    const { args } = await falso!.recebido();
    expect(exec.falha).toBeNull();
    expect(args[args.indexOf("--max-turns") + 1]).toBe("1");
    expect(args[args.indexOf("--max-budget-usd") + 1]).toBe("0.05");
    expect(args[args.indexOf("--output-format") + 1]).toBe("json");
    await falso!.apagar();
    const semToken = await executor(`sair(${JSON.stringify(resultadoCli())});`, fonte(null));
    await expect(
      semToken.executar(pedido({ modo: { tipo: "teste", tetoUsd: 0.05 } })),
    ).rejects.toBeInstanceOf(ErroSemToken);
  });
});

describe("explicarFalha", () => {
  it("o detalhe que vai para o log nunca leva token", () => {
    const f = explicarFalha(
      { codigo: 1, stderr: `erro estranho com ${TOKEN}\n`, motivo: "normal", erroAoIniciar: null },
      1000,
      null,
    );
    expect(f?.detalhe).toBe("erro estranho com sk-ant-[oculto]");
  });
});
