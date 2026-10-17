import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { ESTADO_TOKEN_CLAUDE_VAZIO, type EstadoTokenClaude } from "@zentrade/contratos";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CODIGO_CERTO,
  criarSetupTokenFalso,
  LINK_FALSO,
  TOKEN_FALSO,
  type ModoFalso,
  type SetupTokenFalso,
} from "../../teste/setup-token-falso.js";
import { resolverNoPath } from "../resolver.js";
import { ConexoesClaude, ErroConexaoClaude, type OpcoesConexoes } from "./conexoes.js";
import { acharLink, acharToken, codigoRecusado, semControles } from "./saida.js";
import { linhaDoShell } from "./terminal.js";

const ANA = "7b0c8a52-1d2e-4c3b-9a8f-0e1d2c3b4a59";
const BETO = "0f3e2d1c-4b5a-4968-8776-655443322110";
const CONECTADO: EstadoTokenClaude = { ...ESTADO_TOKEN_CLAUDE_VAZIO, configurado: true, final: "…AbCd" };

const falsos: SetupTokenFalso[] = [];
const gerentes: ConexoesClaude[] = [];
afterEach(async () => {
  await Promise.all(gerentes.splice(0).map((g) => g.encerrarTodas()));
  await Promise.all(falsos.splice(0).map((f) => f.apagar()));
});

async function montar(modo: ModoFalso = "normal", extra: Partial<OpcoesConexoes> = {}) {
  const falso = await criarSetupTokenFalso(modo);
  falsos.push(falso);
  const salvar = vi.fn(async (_u: string, _t: string) => CONECTADO);
  const relogio = { t: 1_800_000_000_000 };
  const g = new ConexoesClaude({
    claude: falso.caminho,
    script: null,
    env: {
      PATH: process.env["PATH"],
      HOME: "/home/zt",
      ANTHROPIC_API_KEY: "sk-ant-api03-nao-pode-vazar",
      ANTHROPIC_AUTH_TOKEN: "nao-pode-vazar",
      ZENTRADE_CHAVE_MESTRA: "nao-pode-vazar",
      DATABASE_URL: "postgres://nao-pode-vazar",
    },
    salvar,
    agora: () => relogio.t,
    atrasoEnterMs: 5,
    esperaLinkMs: 5_000,
    esperaTokenMs: 5_000,
    ...extra,
  });
  gerentes.push(g);
  return { g, falso, salvar, relogio };
}

const erroDe = async (p: Promise<unknown>): Promise<ErroConexaoClaude> => {
  try {
    await p;
  } catch (e) {
    if (e instanceof ErroConexaoClaude) return e;
    throw e;
  }
  throw new Error("deveria ter falhado");
};

describe("conectar o Claude pela tela (claude setup-token de mentira)", () => {
  it("caminho feliz: link da Anthropic, código colado, token gravado e nada sobra", async () => {
    const { g, falso, salvar, relogio } = await montar();
    const conexao = await g.iniciar(ANA);
    expect(conexao.urlAutorizacao).toBe(LINK_FALSO);
    expect(conexao.expiraEm).toBe(relogio.t + 600_000);
    const r = await falso.recebido();
    expect(r.args).toEqual(["setup-token"]);
    expect(r.configVazia).toBe(true);
    expect(r.env["CLAUDE_CONFIG_DIR"]?.startsWith(tmpdir())).toBe(true);
    for (const fora of [
      "ANTHROPIC_API_KEY",
      "ANTHROPIC_AUTH_TOKEN",
      "CLAUDE_CODE_OAUTH_TOKEN",
      "ZENTRADE_CHAVE_MESTRA",
      "DATABASE_URL",
      "CI",
    ]) {
      expect(r.env[fora], fora).toBeUndefined();
    }
    const estado = await g.enviarCodigo(ANA, conexao.conexaoId, CODIGO_CERTO);
    expect(estado).toEqual(CONECTADO);
    expect(salvar).toHaveBeenCalledWith(ANA, TOKEN_FALSO);
    expect(JSON.stringify(estado)).not.toContain("sk-ant");
    expect(g.vivas).toBe(0);
    expect(existsSync(r.env["CLAUDE_CONFIG_DIR"]!)).toBe(false);
  });

  it("código errado: recusa com mensagem clara e não grava nada", async () => {
    const { g, salvar } = await montar();
    const { conexaoId } = await g.iniciar(ANA);
    const e = await erroDe(g.enviarCodigo(ANA, conexaoId, "codigo-errado#estado"));
    expect(e).toMatchObject({ status: 422, codigo: "codigo_recusado" });
    expect(salvar).not.toHaveBeenCalled();
    expect(g.vivas).toBe(0);
  });

  it("CLI que não mostra o link a tempo: 504 e o processo morre", async () => {
    const { g } = await montar("mudo", { esperaLinkMs: 300 });
    expect(await erroDe(g.iniciar(ANA))).toMatchObject({ status: 504, codigo: "conexao_sem_link" });
    expect(g.vivas).toBe(0);
  });

  it("CLI que não responde ao código: 504", async () => {
    const { g } = await montar("lento", { esperaTokenMs: 300 });
    const { conexaoId } = await g.iniciar(ANA);
    expect(await erroDe(g.enviarCodigo(ANA, conexaoId, CODIGO_CERTO))).toMatchObject({
      status: 504,
      codigo: "conexao_sem_resposta",
    });
  });

  it("CLI que fecha na hora: erro claro", async () => {
    const { g } = await montar("sai");
    expect(await erroDe(g.iniciar(ANA))).toMatchObject({ status: 502, codigo: "conexao_falhou" });
  });

  it("link de autorização fora da Anthropic: aborta sem devolver o endereço", async () => {
    const { g } = await montar("fora");
    const e = await erroDe(g.iniciar(ANA));
    expect(e).toMatchObject({ status: 502, codigo: "link_fora_da_anthropic" });
    expect(e.message).not.toContain("exemplo.net");
    expect(g.vivas).toBe(0);
  });

  it("uma conexão viva por pessoa: começar outra cancela a anterior", async () => {
    const { g } = await montar();
    const primeira = await g.iniciar(ANA);
    const segunda = await g.iniciar(ANA);
    expect(segunda.conexaoId).not.toBe(primeira.conexaoId);
    expect(g.vivas).toBe(1);
    expect(await erroDe(g.enviarCodigo(ANA, primeira.conexaoId, CODIGO_CERTO))).toMatchObject({
      status: 404,
    });
    await g.enviarCodigo(ANA, segunda.conexaoId, CODIGO_CERTO);
  });

  it("dono: outra pessoa não usa nem cancela a conexão de ninguém", async () => {
    const { g, salvar } = await montar();
    const { conexaoId } = await g.iniciar(ANA);
    expect(await erroDe(g.enviarCodigo(BETO, conexaoId, CODIGO_CERTO))).toMatchObject({ status: 404 });
    expect(await g.cancelar(BETO, conexaoId)).toBe(false);
    expect(g.vivas).toBe(1);
    expect(salvar).not.toHaveBeenCalled();
    expect(await g.cancelar(ANA, conexaoId)).toBe(true);
    expect(g.vivas).toBe(0);
  });

  it("vence em 10 minutos", async () => {
    const { g, relogio } = await montar();
    const { conexaoId } = await g.iniciar(ANA);
    relogio.t += 600_001;
    expect(await erroDe(g.enviarCodigo(ANA, conexaoId, CODIGO_CERTO))).toMatchObject({ status: 404 });
  });

  it("limite de conexões começadas por hora, por pessoa", async () => {
    const { g, relogio } = await montar("normal", { maxPorHora: 2 });
    await g.iniciar(ANA);
    await g.iniciar(ANA);
    expect(await erroDe(g.iniciar(ANA))).toMatchObject({ status: 429, codigo: "limite_conexoes" });
    await g.iniciar(BETO);
    relogio.t += 3_600_001;
    await g.iniciar(ANA);
  });

  it("falha ao gravar: erro genérico, sem o token", async () => {
    const { g } = await montar("normal", {
      salvar: async (_u, token) => {
        throw new Error(`insert falhou com ${token}`);
      },
    });
    const { conexaoId } = await g.iniciar(ANA);
    const e = await erroDe(g.enviarCodigo(ANA, conexaoId, CODIGO_CERTO));
    expect(e).toMatchObject({ status: 500, codigo: "token_nao_gravado" });
    expect(e.message).not.toContain("sk-ant");
  });
});

const script = resolverNoPath("script", process.env["PATH"]);

describe.skipIf(!script)("num pseudo-terminal de verdade (script do util-linux)", () => {
  it("o CLI vê um terminal, mostra o link e entrega o token", async () => {
    const { g, falso, salvar } = await montar("normal", { script });
    const { conexaoId, urlAutorizacao } = await g.iniciar(ANA);
    expect(urlAutorizacao).toBe(LINK_FALSO);
    expect((await falso.recebido()).tty).toBe(true);
    await g.enviarCodigo(ANA, conexaoId, CODIGO_CERTO);
    expect(salvar).toHaveBeenCalledWith(ANA, TOKEN_FALSO);
  });
});

describe("leitura da tela do setup-token", () => {
  const E = String.fromCharCode(27);

  it("tira cores, hiperlinks e controles", () => {
    expect(semControles(`${E}[1mOlá${E}[0m\r\n${E}]8;;https://x${E}\\link${E}]8;;${E}\\ ok`)).toBe(
      "Olá\nlink ok",
    );
  });

  it("só aceita o link e o token quando chegaram inteiros", () => {
    expect(acharLink(`abra ${LINK_FALSO}`)).toBeNull();
    expect(acharLink(`abra ${LINK_FALSO}\n`)).toEqual({ tipo: "ok", url: LINK_FALSO });
    expect(acharLink("veja https://docs.claude.com/x e depois\n")).toBeNull();
    expect(acharLink("http://claude.ai/oauth/authorize?x \n")).toEqual({ tipo: "fora" });
    expect(acharToken(`token: ${TOKEN_FALSO}`)).toBeNull();
    expect(acharToken(`token: ${TOKEN_FALSO}\n`)).toBe(TOKEN_FALSO);
    expect(acharToken("sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123\n")).toBeNull();
    expect(codigoRecusado("OAuth error: Invalid code")).toBe(true);
    expect(codigoRecusado("Creating token…")).toBe(false);
  });

  it("a linha do shell só leva um caminho absoluto, entre aspas simples", () => {
    expect(linhaDoShell("/usr/bin/claude")).toBe(
      "stty cols 4000 rows 50 2>/dev/null; exec '/usr/bin/claude' setup-token",
    );
    for (const ruim of ["claude", "/x/cl'aude", "/x/claude\n; rm -rf /"]) {
      expect(() => linhaDoShell(ruim), ruim).toThrow();
    }
  });
});
