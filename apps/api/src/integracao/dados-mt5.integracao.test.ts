import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TestarMt5 } from "../integracoes/coletor-mt5.js";
import { comSessao, montarApi, type Api, type Pessoa } from "./ajuda.js";

const CONTA = { servidor: "Clear-Demo", login: "1234567", senha: "senha-super-secreta" };

describe("MetaTrader 5: conta demo e atualização do WIN", () => {
  let api: Api;
  let ana: Pessoa;
  let beto: Pessoa;
  const enfileirados: string[] = [];
  let testar: TestarMt5 = async () => ["WIN$N", "WINZ26"];

  beforeAll(async () => {
    api = await montarApi({
      extras: () => ({
        filaAtualizacoesMt5: { adicionar: async (id) => void enfileirados.push(id) },
        testarMt5: (conta) => testar(conta),
      }),
    });
    ana = await api.pessoa("ana@exemplo.com");
    beto = await api.pessoa("beto@exemplo.com");
  });
  afterAll(async () => api.encerrar());

  const pedir = (p: Pessoa, method: "GET" | "PUT" | "POST" | "DELETE", url: string, payload?: unknown) =>
    api.app.inject({ method, url: `/api/v1${url}`, headers: comSessao(p), ...(payload ? { payload } : {}) });

  it("começa sem conta; atualizar sem conta explica o que fazer", async () => {
    expect((await pedir(ana, "GET", "/dados-mt5")).json()).toMatchObject({ configurado: false });
    const r = await pedir(ana, "POST", "/dados-mt5/atualizar");
    expect(r.statusCode).toBe(409);
    expect(r.json().erro.codigo).toBe("mt5_sem_conta");
  });

  it("salva a conta; a senha, o servidor e o login nunca voltam pela API", async () => {
    const r = await pedir(ana, "PUT", "/dados-mt5", {
      ...CONTA,
      simboloContinuo: "WIN$N",
      fusoServidor: "+03:00",
    });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ configurado: true, loginFinal: "…4567", simboloContinuo: "WIN$N" });
    for (const segredo of Object.values(CONTA)) {
      expect(r.body).not.toContain(segredo);
      expect((await pedir(ana, "GET", "/dados-mt5")).body).not.toContain(segredo);
    }
    expect((await pedir(beto, "GET", "/dados-mt5")).json().configurado).toBe(false);
  });

  it("recusa conta mal formada e fuso inválido", async () => {
    expect((await pedir(ana, "PUT", "/dados-mt5", { ...CONTA, login: "abc" })).statusCode).toBe(400);
    const fuso = await pedir(ana, "PUT", "/dados-mt5", { ...CONTA, fusoServidor: "Marte/Olympus" });
    expect(fuso.json().erro.codigo).toBe("fuso_invalido");
  });

  it("guardar exige identidade confirmada há pouco", async () => {
    api.relogio.t += 6 * 60_000;
    const r = await pedir(ana, "PUT", "/dados-mt5", CONTA);
    expect(r.json().erro.codigo).toBe("reautenticacao_necessaria");
    api.relogio.t -= 6 * 60_000;
  });

  it("testar: sucesso lista os símbolos; falha grava o erro sem a senha", async () => {
    const ok = await pedir(ana, "POST", "/dados-mt5/testar");
    expect(ok.json()).toEqual({ ok: true, simbolos: ["WIN$N", "WINZ26"], erro: null });
    expect((await pedir(ana, "GET", "/dados-mt5")).json().validadaEm).not.toBeNull();
    testar = async (c) => {
      throw new Error(`login recusado para ${c.senha}`);
    };
    const falha = await pedir(ana, "POST", "/dados-mt5/testar");
    expect(falha.json()).toMatchObject({ ok: false });
    expect(falha.body).not.toContain(CONTA.senha);
    expect((await pedir(ana, "GET", "/dados-mt5")).body).not.toContain(CONTA.senha);
    expect((await pedir(beto, "POST", "/dados-mt5/testar")).statusCode).toBe(404);
  });

  it("atualizar enfileira uma linha de importação da própria pessoa; o andamento sai em /dados-b3", async () => {
    const r = await pedir(ana, "POST", "/dados-mt5/atualizar");
    expect(r.statusCode).toBe(202);
    const { id } = r.json();
    expect(r.json()).toMatchObject({ nomeArquivo: "MetaTrader 5 (WIN)", estado: "na_fila" });
    expect(enfileirados).toContain(id);
    expect((await pedir(ana, "GET", `/dados-b3/importacoes/${id}`)).statusCode).toBe(200);
    expect((await pedir(beto, "GET", `/dados-b3/importacoes/${id}`)).statusCode).toBe(404);
  });

  it("remover apaga a conta", async () => {
    expect((await pedir(beto, "DELETE", "/dados-mt5")).statusCode).toBe(404);
    expect((await pedir(ana, "DELETE", "/dados-mt5")).statusCode).toBe(204);
    expect((await pedir(ana, "GET", "/dados-mt5")).json().configurado).toBe(false);
  });
});

describe("MetaTrader 5 sem o coletor configurado", () => {
  let api: Api;
  beforeAll(async () => {
    api = await montarApi();
  });
  afterAll(async () => api.encerrar());

  it("testar responde 503 explicando o perfil mt5", async () => {
    const ana = await api.pessoa("ana@exemplo.com");
    const h = comSessao(ana);
    await api.app.inject({ method: "PUT", url: "/api/v1/dados-mt5", headers: h, payload: CONTA });
    const r = await api.app.inject({ method: "POST", url: "/api/v1/dados-mt5/testar", headers: h });
    expect(r.statusCode).toBe(503);
    expect(r.json().erro.mensagem).toMatch(/perfil mt5/);
  });
});
