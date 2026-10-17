import { randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { comoUsuario } from "../cliente.js";
import { criarBancoDoAgente, type BancoDoAgente } from "../repositorios/assistente-agente.js";
import { repositorioCredenciaisClaude } from "../repositorios/credenciais-claude.js";
import { montarCenario, type Cenario } from "./ajuda.js";

const TOKEN = `sk-ant-oat01-${"a".repeat(86)}wxyz`;
const OUTRO = `sk-ant-oat01-${"b".repeat(86)}9876`;

describe("token do Claude Code de cada pessoa", () => {
  let c: Cenario;
  let agente: BancoDoAgente;
  let chave: Buffer;

  beforeAll(async () => {
    c = await montarCenario();
    chave = randomBytes(32);
    agente = criarBancoDoAgente({ url: c.url, maximoConexoes: 2, chaveMestra: chave });
  });
  afterAll(async () => {
    await agente.fechar();
    await c.encerrar();
  });

  const repo = () => {
    const r = agente.credenciaisClaude;
    if (!r) throw new Error("sem chave mestra");
    return r;
  };
  const comoBeto = (consulta: ReturnType<typeof sql>) =>
    comoUsuario(c.banco.conexao.db, c.beto.id, (tx) => tx.execute(consulta));

  it("sem token: estado vazio, token null", async () => {
    expect(await repo().estado(c.ana.id)).toMatchObject({ configurado: false, final: null });
    expect(await repo().token(c.ana.id)).toBeNull();
  });

  it("grava cifrado, mostra só o final e o agente decifra", async () => {
    const estado = await repo().salvar(c.ana.id, TOKEN, "conexao");
    expect(estado).toMatchObject({ configurado: true, final: "…wxyz", origem: "conexao", validadaEm: null });
    expect((estado.validoAte ?? 0) - (estado.criadaEm ?? 0)).toBe(365 * 86_400_000);
    expect(JSON.stringify(estado)).not.toContain(TOKEN.slice(13, 40));
    expect(await repo().token(c.ana.id)).toBe(TOKEN);
    const [linha] = await c.banco.conexao.db.execute<{ token_cifrado: string }>(
      sql`select token_cifrado from credenciais_claude where usuario_id = ${c.ana.id}`,
    );
    expect(linha?.token_cifrado).not.toContain("sk-ant");
  });

  it("RLS: outra pessoa não lê, não troca e não apaga o token", async () => {
    expect(await repo().token(c.beto.id)).toBeNull();
    expect((await repo().estado(c.beto.id)).configurado).toBe(false);
    expect(await comoBeto(sql`select usuario_id from credenciais_claude`)).toHaveLength(0);
    await comoBeto(sql`update credenciais_claude set token_final = '…hack'`);
    await comoBeto(sql`delete from credenciais_claude`);
    await expect(
      comoBeto(
        sql`insert into credenciais_claude (usuario_id, token_cifrado, token_final, origem) values (${c.ana.id}, 'x', '…xxxx', 'colado')`,
      ),
    ).rejects.toThrow();
    expect((await repo().estado(c.ana.id)).final).toBe("…wxyz");
    expect(await repo().token(c.ana.id)).toBe(TOKEN);
  });

  it("a API (criarBanco) e o agente usam a mesma cifra e o mesmo banco", async () => {
    const api = repositorioCredenciaisClaude(c.banco.conexao.db, chave);
    await api.salvar(c.beto.id, OUTRO, "colado");
    expect(await repo().token(c.beto.id)).toBe(OUTRO);
    expect((await repo().estado(c.beto.id)).validoAte).toBeNull();
    expect(await repo().token(c.ana.id)).toBe(TOKEN);
  });

  it("teste e erro: validada_em e ultimo_erro, sem nunca gravar token", async () => {
    const ok = await repo().registrarTeste(c.ana.id, { ok: true });
    expect(ok.validadaEm).not.toBeNull();
    expect(ok.ultimoErro).toBeNull();
    const falhou = await repo().registrarTeste(c.ana.id, { ok: false, erro: `recusado: ${TOKEN}` });
    expect(falhou.ultimoErro).toBe("recusado: sk-ant-[oculto]");
    await repo().registrarErro(c.ana.id, "x".repeat(900));
    expect((await repo().estado(c.ana.id)).ultimoErro).toHaveLength(500);
    const trocado = await repo().salvar(c.ana.id, OUTRO, "colado");
    expect(trocado).toMatchObject({ final: "…9876", validadaEm: null, ultimoErro: null });
  });

  it("trilha de auditoria: salvo, testado e removido, sem o token", async () => {
    expect(await repo().remover(c.ana.id)).toBe(true);
    expect(await repo().remover(c.ana.id)).toBe(false);
    const linhas = await c.banco.conexao.db.execute<{ acao: string; detalhes: unknown }>(
      sql`select acao, detalhes from auditoria where usuario_id = ${c.ana.id} and acao like 'token_claude%' order by sequencia`,
    );
    expect(linhas.map((l) => l.acao)).toEqual([
      "token_claude_salvo",
      "token_claude_testado",
      "token_claude_testado",
      "token_claude_salvo",
      "token_claude_removido",
    ]);
    expect(JSON.stringify(linhas)).not.toContain("sk-ant");
    expect((await c.banco.auditoria.verificar(c.ana.id)).integra).toBe(true);
  });

  it("sem a chave mestra, o agente não tem acesso ao token", async () => {
    const semChave = criarBancoDoAgente({ url: c.url, maximoConexoes: 1 });
    expect(semChave.credenciaisClaude).toBeNull();
    await semChave.fechar();
  });
});
