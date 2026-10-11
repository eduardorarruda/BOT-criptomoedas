import { generate } from "otplib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarUsuario } from "../comandos/usuario.js";
import { comSessao, cookiesDe, montarApi, ORIGEM, SENHA, type Api, type Pessoa } from "./ajuda.js";

const MIN = 60_000;

describe("autenticação, CSRF, reautenticação e tokens", () => {
  let api: Api;
  let ana: Pessoa;

  beforeAll(async () => {
    api = await montarApi();
    ana = await api.pessoa("ana@exemplo.com");
  });
  afterAll(async () => api.encerrar());

  it("login devolve a pessoa e cookies httpOnly, Secure e SameSite=Strict", async () => {
    await criarUsuario(api.banco, { email: "cookie@exemplo.com", nome: "Cookie", senha: SENHA });
    const r = await api.entrar("cookie@exemplo.com");
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ usuario: { email: "cookie@exemplo.com", doisFatores: false } });
    expect(JSON.stringify(r.json())).not.toContain("senha");
    const sessao = r.cookies.find((c) => c.name === "zt_sessao")!;
    expect(sessao).toMatchObject({ httpOnly: true, secure: true, sameSite: "Strict", path: "/" });
    const csrf = r.cookies.find((c) => c.name === "zt_csrf")!;
    expect(csrf.httpOnly).toBeFalsy();
  });

  it("senha errada e e-mail inexistente recebem a mesma resposta", async () => {
    const errada = await api.app.inject({
      method: "POST",
      url: "/api/v1/sessao",
      payload: { email: "ana@exemplo.com", senha: "errada" },
    });
    const inexistente = await api.app.inject({
      method: "POST",
      url: "/api/v1/sessao",
      payload: { email: "ninguem@exemplo.com", senha: "errada" },
    });
    expect(errada.statusCode).toBe(401);
    expect(errada.json()).toEqual(inexistente.json());
    expect(errada.json()).toMatchObject({ erro: { codigo: "credenciais_invalidas" } });
  });

  it("limita tentativas de login: a sexta seguida recebe 429", async () => {
    const tentar = () =>
      api.app.inject({
        method: "POST",
        url: "/api/v1/sessao",
        payload: { email: "alvo@exemplo.com", senha: "x" },
      });
    for (let i = 0; i < 5; i++) expect((await tentar()).statusCode).toBe(401);
    const bloqueada = await tentar();
    expect(bloqueada.statusCode).toBe(429);
    expect(bloqueada.json()).toMatchObject({ erro: { codigo: "muitas_tentativas" } });
  });

  it("sem sessão: 401 no formato do contrato", async () => {
    const r = await api.app.inject({ method: "GET", url: "/api/v1/robos" });
    expect(r.statusCode).toBe(401);
    expect(r.json()).toEqual({ erro: { codigo: "nao_autenticado", mensagem: expect.any(String) } });
  });

  it("GET /sessao devolve a pessoa e o token CSRF", async () => {
    const r = await api.app.inject({ method: "GET", url: "/api/v1/sessao", headers: { cookie: ana.cookie } });
    expect(r.json()).toMatchObject({ usuario: { id: ana.id }, csrf: ana.csrf });
  });

  it("método que altera exige o cabeçalho CSRF certo", async () => {
    const corpo = { method: "POST" as const, url: "/api/v1/parada-total", payload: { ligada: true } };
    const sem = await api.app.inject({ ...corpo, headers: { cookie: ana.cookie } });
    expect(sem.statusCode).toBe(403);
    expect(sem.json()).toMatchObject({ erro: { codigo: "csrf_invalido" } });
    const errado = await api.app.inject({
      ...corpo,
      headers: { cookie: ana.cookie, "x-csrf-token": "x".repeat(43) },
    });
    expect(errado.statusCode).toBe(403);
    const certo = await api.app.inject({ ...corpo, headers: comSessao(ana) });
    expect(certo.statusCode).toBe(200);
  });

  it("ação crítica exige reautenticação nos últimos 5 minutos", async () => {
    api.relogio.t += 6 * MIN;
    const desligar = () =>
      api.app.inject({
        method: "POST",
        url: "/api/v1/parada-total",
        headers: comSessao(ana),
        payload: { ligada: false },
      });
    const antes = await desligar();
    expect(antes.statusCode).toBe(403);
    expect(antes.json()).toMatchObject({ erro: { codigo: "reautenticacao_necessaria" } });

    const errada = await api.app.inject({
      method: "POST",
      url: "/api/v1/sessao/confirmar",
      headers: comSessao(ana),
      payload: { senha: "errada" },
    });
    expect(errada.statusCode).toBe(401);
    const confirmar = await api.app.inject({
      method: "POST",
      url: "/api/v1/sessao/confirmar",
      headers: comSessao(ana),
      payload: { senha: SENHA },
    });
    expect(confirmar.statusCode).toBe(204);
    expect((await desligar()).json()).toEqual({ ligada: false });
  });

  it("tokens: criados uma vez, com escopo; leitura não opera e nenhum token faz ação de sessão", async () => {
    const criar = (escopo: string) =>
      api.app.inject({
        method: "POST",
        url: "/api/v1/tokens",
        headers: comSessao(ana),
        payload: { nome: `cli-${escopo}`, escopo },
      });
    const leitura = (await criar("leitura")).json<{ token: string; id: string }>();
    const operar = (await criar("operar")).json<{ token: string }>();
    expect(leitura.token).toMatch(/^zt_/);
    const lista = await api.app.inject({
      method: "GET",
      url: "/api/v1/tokens",
      headers: { cookie: ana.cookie },
    });
    expect(JSON.stringify(lista.json())).not.toContain(leitura.token);

    const bearer = (t: string) => ({ authorization: `Bearer ${t}` });
    expect(
      (await api.app.inject({ method: "GET", url: "/api/v1/robos", headers: bearer(leitura.token) }))
        .statusCode,
    ).toBe(200);
    const proibida = await api.app.inject({
      method: "POST",
      url: "/api/v1/parada-total",
      headers: bearer(leitura.token),
      payload: { ligada: true },
    });
    expect(proibida.json()).toMatchObject({ erro: { codigo: "escopo_insuficiente" } });
    const comOperar = await api.app.inject({
      method: "POST",
      url: "/api/v1/parada-total",
      headers: bearer(operar.token),
      payload: { ligada: true },
    });
    expect(comOperar.statusCode).toBe(200);
    const desligarComToken = await api.app.inject({
      method: "POST",
      url: "/api/v1/parada-total",
      headers: bearer(operar.token),
      payload: { ligada: false },
    });
    expect(desligarComToken.json()).toMatchObject({ erro: { codigo: "reautenticacao_necessaria" } });
    const sessaoSo = await api.app.inject({
      method: "GET",
      url: "/api/v1/tokens",
      headers: bearer(operar.token),
    });
    expect(sessaoSo.json()).toMatchObject({ erro: { codigo: "exige_sessao" } });
    const invalido = await api.app.inject({
      method: "GET",
      url: "/api/v1/robos",
      headers: bearer("zt_falso_".padEnd(40, "x")),
    });
    expect(invalido.statusCode).toBe(401);
    const malformado = await api.app.inject({
      method: "GET",
      url: "/api/v1/robos",
      headers: { authorization: "Basic abc" },
    });
    expect(malformado.statusCode).toBe(401);

    const apagar = await api.app.inject({
      method: "DELETE",
      url: `/api/v1/tokens/${leitura.id}`,
      headers: comSessao(ana),
    });
    expect(apagar.statusCode).toBe(204);
    expect(
      (await api.app.inject({ method: "GET", url: "/api/v1/robos", headers: bearer(leitura.token) }))
        .statusCode,
    ).toBe(401);
    const deNovo = await api.app.inject({
      method: "DELETE",
      url: `/api/v1/tokens/${leitura.id}`,
      headers: comSessao(ana),
    });
    expect(deNovo.statusCode).toBe(404);
  });

  it("2FA: ativado, passa a ser exigido no login e vale como confirmação", async () => {
    const beto = await api.pessoa("beto@exemplo.com");
    const segredo = await api.ativar2fa(beto);
    const deNovo = await api.app.inject({
      method: "POST",
      url: "/api/v1/sessao/2fa",
      headers: comSessao(beto),
    });
    expect(deNovo.json()).toMatchObject({ erro: { codigo: "2fa_ja_ativo" } });

    const semCodigo = await api.entrar("beto@exemplo.com");
    expect(semCodigo.json()).toMatchObject({ erro: { codigo: "codigo2fa_necessario" } });
    const codigoErrado = await api.entrar("beto@exemplo.com", "000000");
    expect(codigoErrado.statusCode).toBe(401);
    const comCodigo = await api.entrar("beto@exemplo.com", await generate({ secret: segredo }));
    expect(comCodigo.statusCode).toBe(200);
    expect(comCodigo.json()).toMatchObject({ usuario: { doisFatores: true } });

    const confirmar = await api.app.inject({
      method: "POST",
      url: "/api/v1/sessao/confirmar",
      headers: comSessao(beto),
      payload: { codigo2fa: await generate({ secret: segredo }) },
    });
    expect(confirmar.statusCode).toBe(204);
  });

  it("ativar 2FA sem começar, com código errado, ou confirmar por código sem 2FA, falham", async () => {
    const caio = await api.pessoa("caio@exemplo.com");
    const ativar = (codigo: string) =>
      api.app.inject({
        method: "POST",
        url: "/api/v1/sessao/2fa/ativar",
        headers: comSessao(caio),
        payload: { codigo },
      });
    expect((await ativar("123456")).json()).toMatchObject({ erro: { codigo: "2fa_nao_iniciado" } });
    await api.app.inject({ method: "POST", url: "/api/v1/sessao/2fa", headers: comSessao(caio) });
    expect((await ativar("abc")).json()).toMatchObject({ erro: { codigo: "codigo_2fa_invalido" } });
    const porCodigo = await api.app.inject({
      method: "POST",
      url: "/api/v1/sessao/confirmar",
      headers: comSessao(caio),
      payload: { codigo2fa: "123456" },
    });
    expect(porCodigo.statusCode).toBe(401);
    const vazio = await api.app.inject({
      method: "POST",
      url: "/api/v1/sessao/confirmar",
      headers: comSessao(caio),
      payload: {},
    });
    expect(vazio.json()).toMatchObject({ erro: { codigo: "dados_invalidos" } });
  });

  it("logout apaga a sessão no servidor", async () => {
    const dani = await api.pessoa("dani@exemplo.com");
    const sair = await api.app.inject({ method: "DELETE", url: "/api/v1/sessao", headers: comSessao(dani) });
    expect(sair.statusCode).toBe(204);
    const depois = await api.app.inject({
      method: "GET",
      url: "/api/v1/sessao",
      headers: { cookie: dani.cookie },
    });
    expect(depois.statusCode).toBe(401);
  });

  it("cabeçalhos de segurança, CORS só para a tela e erro de rota inexistente", async () => {
    const r = await api.app.inject({ method: "GET", url: "/api/v1/saude", headers: { origin: ORIGEM } });
    expect(r.headers["x-content-type-options"]).toBe("nosniff");
    expect(r.headers["strict-transport-security"]).toBeDefined();
    expect(r.headers["access-control-allow-origin"]).toBe(ORIGEM);
    expect(r.headers["access-control-allow-credentials"]).toBe("true");
    const estranho = await api.app.inject({
      method: "GET",
      url: "/api/v1/saude",
      headers: { origin: "https://mal.exemplo" },
    });
    expect(estranho.headers["access-control-allow-origin"]).toBeUndefined();
    const nada = await api.app.inject({ method: "GET", url: "/nao-existe", headers: { cookie: ana.cookie } });
    expect(nada.json()).toMatchObject({ erro: { codigo: "rota_inexistente" } });
  });

  it("JSON quebrado vira erro de requisição, sem detalhe interno", async () => {
    const r = await api.app.inject({
      method: "POST",
      url: "/api/v1/sessao",
      headers: { "content-type": "application/json" },
      payload: "{quebrado",
    });
    expect(r.statusCode).toBe(400);
    expect(r.json()).toMatchObject({ erro: { codigo: "requisicao_invalida" } });
  });

  it("criar pessoa pelo comando valida e-mail e senha", async () => {
    await expect(criarUsuario(api.banco, { email: "x", nome: "X", senha: SENHA })).rejects.toThrow(/e-mail/);
    await expect(
      criarUsuario(api.banco, { email: "f@exemplo.com", nome: "F", senha: "curta" }),
    ).rejects.toThrow(/12/);
  });
  it("sessão vence depois de 12 horas", async () => {
    await criarUsuario(api.banco, { email: "eva@exemplo.com", nome: "Eva", senha: SENHA });
    const cookie = cookiesDe(await api.entrar("eva@exemplo.com"));
    api.relogio.t += 13 * 60 * MIN;
    const r = await api.app.inject({ method: "GET", url: "/api/v1/sessao", headers: { cookie } });
    expect(r.statusCode).toBe(401);
  });
});
