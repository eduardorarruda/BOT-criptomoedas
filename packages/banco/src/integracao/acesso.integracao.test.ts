import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { montarCenario, type Cenario } from "./ajuda.js";

describe("contas da corretora, tokens, sessões e auditoria", () => {
  let c: Cenario;
  beforeAll(async () => {
    c = await montarCenario();
  });
  afterAll(async () => c.encerrar());

  it("cifra a chave e o segredo; a listagem nunca devolve o segredo", async () => {
    const conta = await c.banco.contas.criar(c.ana.id, {
      corretora: "binance",
      rede: "testnet",
      apiKey: "chave-publica-a1b2",
      apiSecret: "segredo-muito-secreto",
    });
    expect(conta).toMatchObject({ corretora: "binance", rede: "testnet", apiKeyFinal: "…a1b2" });
    expect(JSON.stringify(await c.banco.contas.listar(c.ana.id))).not.toContain("segredo");

    const [linha] = await c.banco.conexao
      .sql`select api_key_cifrada, api_secret_cifrado from contas_corretora`;
    expect(JSON.stringify(linha)).not.toContain("segredo-muito-secreto");
    expect(JSON.stringify(linha)).not.toContain("chave-publica");

    expect(await c.banco.contas.credenciais(c.ana.id, "testnet")).toEqual({
      apiKey: "chave-publica-a1b2",
      apiSecret: "segredo-muito-secreto",
    });
    expect(await c.banco.contas.credenciais(c.beto.id, "testnet")).toBeNull();
    expect(await c.banco.contas.listar(c.beto.id)).toEqual([]);
  });

  it("recusa cadastrar a mesma corretora e rede duas vezes", async () => {
    await expect(
      c.banco.contas.criar(c.ana.id, {
        corretora: "binance",
        rede: "testnet",
        apiKey: "k2-zzzz",
        apiSecret: "s2",
      }),
    ).rejects.toMatchObject({ codigo: "conflito" });
  });

  it("remove só a própria conta", async () => {
    const [conta] = await c.banco.contas.listar(c.ana.id);
    expect(await c.banco.contas.remover(c.beto.id, conta!.id)).toBe(false);
    expect(await c.banco.contas.remover(c.ana.id, conta!.id)).toBe(true);
  });

  it("tokens: guarda só o hash e acha a dona pelo hash", async () => {
    const token = await c.banco.tokens.criar(c.ana.id, {
      nome: "CLI",
      escopo: "leitura",
      hash: "h".repeat(64),
    });
    expect(await c.banco.tokens.porHash("h".repeat(64))).toMatchObject({
      usuarioId: c.ana.id,
      escopo: "leitura",
    });
    expect(await c.banco.tokens.porHash("x".repeat(64))).toBeNull();
    expect(await c.banco.tokens.listar(c.beto.id)).toEqual([]);
    expect(await c.banco.tokens.existe(token.id)).toBe(true);
    expect(await c.banco.tokens.remover(c.ana.id, token.id)).toBe(true);
    expect(await c.banco.tokens.porHash("h".repeat(64))).toBeNull();
    expect(await c.banco.tokens.existe(token.id)).toBe(false);
  });

  it("sessões vencem e podem ser reautenticadas", async () => {
    const agora = Date.now();
    await c.banco.sessoes.criar({ id: "s1", usuarioId: c.ana.id, csrf: "c1", expiraEm: agora + 60_000 });
    const sessao = await c.banco.sessoes.obter("s1", agora);
    expect(sessao).toMatchObject({ csrf: "c1", usuario: { email: "ana@exemplo.com" } });
    await c.banco.sessoes.reautenticar("s1", agora + 1000);
    expect((await c.banco.sessoes.obter("s1", agora))!.reautenticadaEm).toBe(agora + 1000);
    expect(await c.banco.sessoes.obter("s1", agora + 120_000)).toBeNull();
    await c.banco.sessoes.remover("s1");
    expect(await c.banco.sessoes.obter("s1", agora)).toBeNull();
  });

  it("segredo do 2FA fica cifrado e só vale depois de ativado", async () => {
    await c.banco.usuarios.definirSegredo2fa(c.beto.id, "JBSWY3DPEHPK3PXP");
    expect(await c.banco.usuarios.segredo2fa(c.beto.id)).toBe("JBSWY3DPEHPK3PXP");
    expect((await c.banco.usuarios.porId(c.beto.id))!.doisFatores).toBe(false);
    await c.banco.usuarios.ativar2fa(c.beto.id);
    expect((await c.banco.usuarios.porId(c.beto.id))!.doisFatores).toBe(true);
    const [linha] = await c.banco.conexao.sql`select segredo_2fa from usuarios where id = ${c.beto.id}`;
    expect(linha!.segredo_2fa).not.toContain("JBSWY3DPEHPK3PXP");
  });

  it("auditoria encadeada: cada registro aponta o hash do anterior e adulteração é detectada", async () => {
    await c.banco.auditoria.registrar({ usuarioId: c.beto.id, acao: "teste", detalhes: { n: 1 } });
    await c.banco.auditoria.registrar({ usuarioId: c.beto.id, acao: "teste", detalhes: { n: 2 } });
    const verificacao = await c.banco.auditoria.verificar(c.beto.id);
    expect(verificacao.integra).toBe(true);
    expect(verificacao.registros).toBeGreaterThanOrEqual(2);
    await expect(c.banco.conexao.sql`delete from auditoria`).rejects.toThrow(/só aceita inclusão/);

    // Simula alguém com acesso de superusuário que desliga o gatilho e mexe num registro.
    await c.banco.conexao.sql.begin(async (tx) => {
      await tx`alter table auditoria disable trigger auditoria_imutavel`;
      await tx`update auditoria set detalhes = '{"n": 99}'
               where usuario_id = ${c.beto.id} and acao = 'teste' and detalhes->>'n' = '1'`;
      await tx`alter table auditoria enable trigger auditoria_imutavel`;
    });
    const depois = await c.banco.auditoria.verificar(c.beto.id);
    expect(depois.integra).toBe(false);
    expect(depois.quebraEm).toBeDefined();
  });

  it("e-mail é único e guardado em minúsculas", async () => {
    await expect(
      c.banco.usuarios.criar({ email: "ANA@exemplo.com", nome: "Outra", senhaHash: "x" }),
    ).rejects.toMatchObject({ codigo: "conflito" });
    expect((await c.banco.usuarios.porEmail("Ana@Exemplo.com"))!.id).toBe(c.ana.id);
    expect(await c.banco.usuarios.contar()).toBe(2);
  });
});
