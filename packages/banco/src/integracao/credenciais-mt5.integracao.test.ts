import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { montarCenario, type Cenario } from "./ajuda.js";

const CONTA = { servidor: "Clear-Demo", login: "1234567", senha: "segredo-da-demo" };

describe("credenciais do MetaTrader 5 (conta demo)", () => {
  let c: Cenario;
  beforeAll(async () => {
    c = await montarCenario();
  });
  afterAll(async () => c.encerrar());

  it("salva cifrado, devolve só o estado e nunca o segredo", async () => {
    const estado = await c.banco.credenciaisMt5.salvar(c.ana.id, { ...CONTA, simboloContinuo: "WIN$N" });
    expect(estado).toMatchObject({ configurado: true, loginFinal: "…4567", simboloContinuo: "WIN$N" });
    expect(JSON.stringify(estado)).not.toContain(CONTA.senha);
    expect(JSON.stringify(estado)).not.toContain(CONTA.servidor);
    // No banco, nada em claro.
    const linhas = await c.banco.conexao.sql.unsafe(
      "select servidor_cifrado, login_cifrado, senha_cifrada from credenciais_mt5",
    );
    const bruto = JSON.stringify(linhas);
    for (const segredo of [CONTA.senha, CONTA.servidor, CONTA.login]) expect(bruto).not.toContain(segredo);
  });

  it("decifra só para quem pede por credenciais(); outra pessoa não vê nada (RLS)", async () => {
    expect(await c.banco.credenciaisMt5.credenciais(c.ana.id)).toMatchObject(CONTA);
    expect(await c.banco.credenciaisMt5.credenciais(c.beto.id)).toBeNull();
    expect((await c.banco.credenciaisMt5.estado(c.beto.id)).configurado).toBe(false);
    expect(await c.banco.credenciaisMt5.remover(c.beto.id)).toBe(false);
  });

  it("o envelope de uma pessoa não abre na linha de outra (contexto leva o id)", async () => {
    await c.banco.credenciaisMt5.salvar(c.beto.id, { ...CONTA, senha: "outra-senha" });
    await c.banco.conexao.sql.unsafe(
      `update credenciais_mt5 set senha_cifrada = (select senha_cifrada from credenciais_mt5 where usuario_id = '${c.ana.id}') where usuario_id = '${c.beto.id}'`,
    );
    await expect(c.banco.credenciaisMt5.credenciais(c.beto.id)).rejects.toMatchObject({ name: "ErroCifra" });
  });

  it("registra o teste (sucesso e erro) e lista os donos", async () => {
    await c.banco.credenciaisMt5.registrarTeste(c.ana.id, { ok: false, erro: "login recusado" });
    expect((await c.banco.credenciaisMt5.estado(c.ana.id)).ultimoErro).toBe("login recusado");
    const ok = await c.banco.credenciaisMt5.registrarTeste(c.ana.id, { ok: true });
    expect(ok).toMatchObject({ ultimoErro: null });
    expect(ok.validadaEm).not.toBeNull();
    expect((await c.banco.credenciaisMt5.donos()).sort()).toEqual([c.ana.id, c.beto.id].sort());
  });

  it("trocar a conta limpa o teste anterior; remover apaga", async () => {
    const novo = await c.banco.credenciaisMt5.salvar(c.ana.id, { ...CONTA, login: "7654321" });
    expect(novo).toMatchObject({ loginFinal: "…4321", validadaEm: null, ultimoErro: null });
    expect(await c.banco.credenciaisMt5.remover(c.ana.id)).toBe(true);
    expect((await c.banco.credenciaisMt5.estado(c.ana.id)).configurado).toBe(false);
  });
});
