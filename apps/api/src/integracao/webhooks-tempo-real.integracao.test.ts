import { assinar, CANAL_EVENTOS, type Evento } from "@zentrade/contratos";
import { dec } from "@zentrade/dominio";
import { Redis } from "ioredis";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { CHAVE_BATIDA_MOTOR } from "../integracoes/redis.js";
import { FECHAMENTO_SESSAO_ENCERRADA } from "../rotas/tempo-real.js";
import {
  comSessao,
  embeddingsFalsos,
  montarApi,
  ORIGEM,
  SEGREDO_WEBHOOK,
  type Api,
  type Pessoa,
} from "./ajuda.js";

type WebSocket = Awaited<ReturnType<FastifyInstance["injectWS"]>>;

describe("webhooks do n8n e tempo real", () => {
  let api: Api;
  let ana: Pessoa;
  let beto: Pessoa;
  let roboAna: string;
  let publicador: Redis;

  const webhook = (caminho: string, corpo: string, assinatura?: string) =>
    api.app.inject({
      method: "POST",
      url: `/webhooks/n8n/${caminho}`,
      headers: {
        "content-type": "application/json",
        ...(assinatura !== undefined ? { "x-zentrade-assinatura": assinatura } : {}),
      },
      payload: corpo,
    });
  const assinado = (caminho: string, objeto: unknown) => {
    const corpo = JSON.stringify(objeto);
    return webhook(caminho, corpo, assinar(corpo, SEGREDO_WEBHOOK, api.relogio.t));
  };

  const decisaoAguardando = () =>
    api.banco.portas.decisoes.registrar({
      roboId: roboAna,
      em: api.relogio.t,
      sinal: { acao: "COMPRAR", stop: dec("98"), alvo: dec("102"), explicacao: "cruzamento de médias" },
      preco: dec("100"),
      quantidade: dec("0.1"),
      risco: { aprovada: true, barreiras: [] },
      estado: "aguardando_aprovacao",
    });

  beforeAll(async () => {
    api = await montarApi({ embeddings: embeddingsFalsos });
    ana = await api.pessoa("ana@exemplo.com");
    beto = await api.pessoa("beto@exemplo.com");
    const estrategia = await api.banco.estrategias.criar(ana.id, {
      nome: "x",
      entrada: {
        tipo: "comparar",
        esquerda: { tipo: "preco" },
        comparador: ">",
        direita: { tipo: "numero", valor: 1 },
      },
      stop: 0.02,
      alvoLiquido: 0.01,
      taxa: 0.001,
    });
    const robo = await api.banco.robos.criar(ana.id, {
      nome: "r",
      simbolo: "BTCUSDT",
      intervalo: "1h",
      modo: "observar",
      rede: "papel",
      estrategiaId: estrategia.id,
      estrategiaVersao: 1,
      limites: {
        perdaDiariaMaxima: "1",
        exposicaoMaxima: "1",
        riscoPorOperacao: "1",
        ordensPorHoraMax: 1,
        pausaAposPerdaMin: 0,
        confiancaMinima: 0.5,
        diasDeEvento: "ignorar",
        agente: "decide",
      },
    });
    roboAna = robo.id;
    publicador = new Redis(api.redisUrl);
  });
  afterAll(async () => {
    await publicador.quit();
    await api.encerrar();
  });

  it("aprovação assinada decide a decisão", async () => {
    const id = await decisaoAguardando();
    const r = await assinado("aprovacao", { decisaoId: id, aprovada: true, porQuem: "telegram:ana" });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ id, estado: "aprovada" });
    const deNovo = await assinado("aprovacao", { decisaoId: id, aprovada: false, porQuem: "telegram:ana" });
    expect(deNovo.statusCode).toBe(409);
    const inexistente = await assinado("aprovacao", {
      decisaoId: "nao-existe",
      aprovada: true,
      porQuem: "x",
    });
    expect(inexistente.statusCode).toBe(404);
  });

  it("recusa assinatura ausente, errada, de outro corpo ou vencida", async () => {
    const corpo = JSON.stringify({ decisaoId: "x", aprovada: true, porQuem: "x" });
    expect((await webhook("aprovacao", corpo)).statusCode).toBe(401);
    expect((await webhook("aprovacao", corpo, "t=1,v1=abc")).statusCode).toBe(401);
    const deOutro = assinar("{}", SEGREDO_WEBHOOK, api.relogio.t);
    expect((await webhook("aprovacao", corpo, deOutro)).statusCode).toBe(401);
    const vencida = assinar(corpo, SEGREDO_WEBHOOK, api.relogio.t - 6 * 60_000);
    const r = await webhook("aprovacao", corpo, vencida);
    expect(r.statusCode).toBe(401);
    expect(r.json()).toMatchObject({ erro: { codigo: "assinatura_invalida" } });
    const outroSegredo = assinar(corpo, "z".repeat(40), api.relogio.t);
    expect((await webhook("aprovacao", corpo, outroSegredo)).statusCode).toBe(401);
  });

  it("JSON quebrado mas assinado vira erro claro", async () => {
    const corpo = "{quebrado";
    const r = await webhook("aprovacao", corpo, assinar(corpo, SEGREDO_WEBHOOK, api.relogio.t));
    expect(r.statusCode).toBe(400);
    expect(r.json()).toMatchObject({ erro: { codigo: "json_invalido" } });
  });

  it("com mais de uma pessoa e sem N8N_USUARIO_ID, o conhecimento é recusado com explicação", async () => {
    const noticia = {
      fonte: "noticia",
      titulo: "ETF aprovado",
      url: "https://exemplo.com/etf",
      publicadoEm: api.relogio.t,
      texto: "O regulador aprovou o ETF.",
    };
    const r = await assinado("conhecimento", noticia);
    expect(r.statusCode).toBe(409);
    expect(r.json()).toMatchObject({ erro: { codigo: "n8n_usuario_obrigatorio" } });
    expect(r.json<{ erro: { mensagem: string } }>().erro.mensagem).toMatch(/N8N_USUARIO_ID/);
    const perigosa = await assinado("conhecimento", { ...noticia, url: "javascript:alert(1)" });
    expect(perigosa.statusCode).toBe(400);
  });

  it("anti-replay: a mesma requisição assinada só passa uma vez", async () => {
    const id = await decisaoAguardando();
    const corpo = JSON.stringify({ decisaoId: id, aprovada: false, porQuem: "telegram:ana" });
    const cabecalho = assinar(corpo, SEGREDO_WEBHOOK, api.relogio.t);
    expect((await webhook("aprovacao", corpo, cabecalho)).statusCode).toBe(200);
    const copia = await webhook("aprovacao", corpo, cabecalho);
    expect(copia.statusCode).toBe(409);
    expect(copia.json()).toMatchObject({ erro: { codigo: "webhook_repetido" } });
    // A mesma assinatura em outro caminho é outra chave (e lá não confere com o corpo de qualquer jeito).
    api.relogio.t += 1000;
    const assinadaDeNovo = await webhook("aprovacao", corpo, assinar(corpo, SEGREDO_WEBHOOK, api.relogio.t));
    expect(assinadaDeNovo.statusCode).toBe(409);
    expect(assinadaDeNovo.json()).toMatchObject({ erro: { codigo: "estado_invalido" } });
  });

  it("vigia de saúde recebe a batida do motor e os robôs pausados", async () => {
    await publicador.set(CHAVE_BATIDA_MOTOR, String(api.relogio.t - 30_000));
    const corpo = "";
    const r = await api.app.inject({
      method: "POST",
      url: "/webhooks/n8n/saude",
      headers: { "x-zentrade-assinatura": assinar(corpo, SEGREDO_WEBHOOK, api.relogio.t) },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ motorVivoHaSegundos: 30, robosPausados: 0 });
    const saude = await api.app.inject({ method: "GET", url: "/api/v1/saude" });
    expect(saude.json()).toMatchObject({ servicos: { motor: true } });
    await publicador.del(CHAVE_BATIDA_MOTOR);
  });

  const conectar = (p: Pessoa, origem = ORIGEM) =>
    api.app.injectWS("/api/v1/tempo-real", { headers: { cookie: p.cookie, origin: origem } });

  const proximaMensagem = (ws: WebSocket): Promise<Evento> =>
    new Promise((resolve) =>
      ws.once("message", (dado: Buffer) => resolve(JSON.parse(String(dado)) as Evento)),
    );

  it("tempo real: a dona recebe o evento do robô; outra pessoa, não", async () => {
    const wsAna = await conectar(ana);
    const wsBeto = await conectar(beto);
    const recebidosBeto: Evento[] = [];
    wsBeto.on("message", (d: Buffer) => recebidosBeto.push(JSON.parse(String(d)) as Evento));
    try {
      const chegou = proximaMensagem(wsAna);
      const evento: Evento = {
        tipo: "risco",
        roboId: roboAna,
        barreira: { codigo: "pausado", mensagem: "parada total ligada" },
        em: 1,
      };
      await publicador.publish(CANAL_EVENTOS, JSON.stringify(evento));
      expect(await chegou).toEqual(evento);

      const preco = proximaMensagem(wsBeto);
      await publicador.publish(
        CANAL_EVENTOS,
        JSON.stringify({ tipo: "preco", simbolo: "BTCUSDT", preco: "1", em: 1 }),
      );
      expect((await preco).tipo).toBe("preco");
      expect(recebidosBeto.map((e) => e.tipo)).toEqual(["preco"]);
    } finally {
      wsAna.terminate();
      wsBeto.terminate();
    }
  });

  it("tempo real recusa quem não está autenticado e origem estranha", async () => {
    await expect(api.app.injectWS("/api/v1/tempo-real")).rejects.toThrow(/401/);
    await expect(conectar(ana, "https://mal.exemplo")).rejects.toThrow(/403/);
  });

  it("decisão aguardando aprovação no canal vira proposta assinada para o n8n", async () => {
    const id = await decisaoAguardando();
    const decisao = await api.banco.decisoes.obter(ana.id, id);
    const { ordem: _, ...dto } = decisao!;
    await publicador.publish(CANAL_EVENTOS, JSON.stringify({ tipo: "decisao", decisao: dto }));
    await expect
      .poll(() => api.n8n.propostas.find((p) => p.decisaoId === id))
      .toMatchObject({
        simbolo: "BTCUSDT",
        acao: "COMPRAR",
        quantidade: "0.1",
      });
  });

  it("automações: o status vem dos webhooks recebidos e dos avisos enviados", async () => {
    const r = await api.app.inject({
      method: "GET",
      url: "/api/v1/automacoes",
      headers: { cookie: ana.cookie },
    });
    expect(r.statusCode).toBe(200);
    const porId = Object.fromEntries(
      r.json<{ id: string; ultimoResultado: string; falhas24h: number }[]>().map((a) => [a.id, a]),
    );
    expect(porId["zentrade-vigia-saude"]).toMatchObject({ ultimoResultado: "ok", ativa: true });
    expect(porId["zentrade-aprovacao"]).toMatchObject({ ultimoResultado: expect.any(String) });
    expect(porId["zentrade-noticias"]).toMatchObject({ ultimoResultado: "falhou" });
    expect(porId["zentrade-noticias"]!.falhas24h).toBeGreaterThan(0);
  });

  it("tempo real fecha quando a sessão é encerrada", async () => {
    const caio = await api.pessoa("caio@exemplo.com");
    const ws = await conectar(caio);
    const fechou = new Promise<number>((resolve) => ws.once("close", (codigo: number) => resolve(codigo)));
    await api.app.inject({ method: "DELETE", url: "/api/v1/sessao", headers: comSessao(caio) });
    expect(await fechou).toBe(FECHAMENTO_SESSAO_ENCERRADA);
  });

  it("tempo real fecha quando o token é revogado", async () => {
    const dani = await api.pessoa("dani@exemplo.com");
    const criado = await api.app.inject({
      method: "POST",
      url: "/api/v1/tokens",
      headers: comSessao(dani),
      payload: { nome: "cli", escopo: "leitura" },
    });
    const { id, token } = criado.json<{ id: string; token: string }>();
    const ws = await api.app.injectWS("/api/v1/tempo-real", {
      headers: { authorization: `Bearer ${token}` },
    });
    const fechou = new Promise<number>((resolve) => ws.once("close", (codigo: number) => resolve(codigo)));
    await api.app.inject({ method: "DELETE", url: `/api/v1/tokens/${id}`, headers: comSessao(dani) });
    expect(await fechou).toBe(FECHAMENTO_SESSAO_ENCERRADA);
  });

  it("CSRF não vale para webhooks (assinatura substitui sessão), mas sessão sozinha não abre webhook", async () => {
    const corpo = JSON.stringify({ decisaoId: "x", aprovada: true, porQuem: "x" });
    const r = await api.app.inject({
      method: "POST",
      url: "/webhooks/n8n/aprovacao",
      headers: { ...comSessao(ana), "content-type": "application/json" },
      payload: corpo,
    });
    expect(r.statusCode).toBe(401);
  });
});
