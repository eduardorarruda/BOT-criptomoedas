import { dec } from "@zentrade/dominio";
import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { generate } from "otplib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { comSessao, embeddingsFalsos, montarApi, SENHA, type Api, type Pessoa } from "./ajuda.js";

const ESTRATEGIA = {
  nome: "Médias",
  entrada: {
    tipo: "comparar",
    esquerda: { tipo: "indicador", nome: "sma", periodo: 9 },
    comparador: "cruzouAcima",
    direita: { tipo: "indicador", nome: "sma", periodo: 21 },
  },
  stop: 0.02,
  alvoLiquido: 0.01,
  taxa: 0.001,
};

const LIMITES = {
  perdaDiariaMaxima: "50",
  exposicaoMaxima: "1000",
  riscoPorOperacao: "10",
  ordensPorHoraMax: 6,
  pausaAposPerdaMin: 30,
  confiancaMinima: 0.6,
};

describe("rotas de recursos contra banco e Redis reais", () => {
  let api: Api;
  let ana: Pessoa;
  let beto: Pessoa;
  let estrategiaId: string;
  let roboId: string;

  const chamar = (p: Pessoa, method: "GET" | "POST" | "PATCH" | "DELETE", url: string, payload?: object) =>
    api.app.inject({ method, url: `/api/v1${url}`, headers: comSessao(p), ...(payload ? { payload } : {}) });

  beforeAll(async () => {
    api = await montarApi({ embeddings: embeddingsFalsos });
    ana = await api.pessoa("ana@exemplo.com");
    beto = await api.pessoa("beto@exemplo.com");
  });
  afterAll(async () => api.encerrar());

  it("estratégias: cria a versão 1, valida a regra e versiona", async () => {
    const criada = await chamar(ana, "POST", "/estrategias", ESTRATEGIA);
    expect(criada.statusCode).toBe(201);
    expect(criada.json()).toMatchObject({ versao: 1, nome: "Médias" });
    estrategiaId = criada.json<{ id: string }>().id;

    const invalida = await chamar(ana, "POST", "/estrategias", { ...ESTRATEGIA, stop: 0.9 });
    expect(invalida.statusCode).toBe(400);
    expect(invalida.json()).toMatchObject({ erro: { codigo: "dados_invalidos" } });

    const v2 = await chamar(ana, "POST", `/estrategias/${estrategiaId}/versoes`, {
      ...ESTRATEGIA,
      stop: 0.03,
    });
    expect(v2.json()).toMatchObject({ versao: 2, stop: 0.03 });
    const detalhe = await chamar(ana, "GET", `/estrategias/${estrategiaId}`);
    expect(detalhe.json<{ versoes: unknown[] }>().versoes).toHaveLength(2);
    expect((await chamar(ana, "GET", "/estrategias")).json()).toHaveLength(1);
    expect((await chamar(beto, "GET", `/estrategias/${estrategiaId}`)).statusCode).toBe(404);
    expect((await chamar(ana, "GET", "/estrategias/nao-e-uuid")).statusCode).toBe(404);
  });

  it("robôs: nascem observando mesmo que peçam auto; outra pessoa não vê", async () => {
    const r = await chamar(ana, "POST", "/robos", {
      nome: "BTC",
      simbolo: "BTCUSDT",
      intervalo: "1h",
      modo: "auto",
      rede: "real",
      estrategiaId,
      estrategiaVersao: 1,
      limites: LIMITES,
    });
    expect(r.statusCode).toBe(201);
    expect(r.json()).toMatchObject({ modo: "observar", pausado: false, rede: "real" });
    roboId = r.json<{ id: string }>().id;
    expect((await chamar(ana, "GET", "/robos")).json()).toHaveLength(1);
    expect((await chamar(beto, "GET", `/robos/${roboId}`)).statusCode).toBe(404);
    expect((await chamar(ana, "GET", `/robos/${roboId}`)).json()).toMatchObject({ id: roboId });
  });

  it("ligar dinheiro real exige 2FA e reautenticação; pausar não", async () => {
    const pausar = await chamar(ana, "PATCH", `/robos/${roboId}`, { pausado: true, nome: "BTC lento" });
    expect(pausar.json()).toMatchObject({ pausado: true, nome: "BTC lento" });
    const sem2fa = await chamar(ana, "PATCH", `/robos/${roboId}`, { modo: "auto" });
    expect(sem2fa.json()).toMatchObject({ erro: { codigo: "2fa_obrigatorio" } });

    const segredo = await api.ativar2fa(ana);
    api.relogio.t += 6 * 60_000;
    const semReauth = await chamar(ana, "PATCH", `/robos/${roboId}`, { modo: "auto" });
    expect(semReauth.json()).toMatchObject({ erro: { codigo: "reautenticacao_necessaria" } });
    const confirmar = await chamar(ana, "POST", "/sessao/confirmar", {
      codigo2fa: await generate({ secret: segredo }),
    });
    expect(confirmar.statusCode).toBe(204);
    const ligado = await chamar(ana, "PATCH", `/robos/${roboId}`, { modo: "auto", limites: LIMITES });
    expect(ligado.json()).toMatchObject({ modo: "auto" });
    expect((await chamar(ana, "PATCH", `/robos/${roboId}`, { pausado: false })).statusCode).toBe(200);
    expect((await chamar(beto, "PATCH", `/robos/${roboId}`, { pausado: true })).statusCode).toBe(404);
  });

  it("decisões: lista, detalha com a ordem, aprova uma vez e respeita a dona", async () => {
    const nova = (estado: "aguardando_aprovacao" | "registrada") =>
      api.banco.portas.decisoes.registrar({
        roboId,
        em: api.relogio.t,
        sinal: { acao: "COMPRAR", stop: dec("98"), alvo: dec("102"), explicacao: "cruzou" },
        preco: dec("100"),
        quantidade: dec("0.5"),
        risco: { aprovada: true, barreiras: [] },
        estado,
      });
    const aguardando = await nova("aguardando_aprovacao");
    const registrada = await nova("registrada");
    await api.banco.portas.ordens.reservar({
      decisaoId: registrada,
      roboId,
      idCliente: "zt-api-1",
      simbolo: "BTCUSDT",
      lado: "COMPRA",
      quantidade: dec("0.5"),
    });
    await api.banco.portas.ordens.concluir("zt-api-1", {
      idCliente: "zt-api-1",
      idCorretora: "1",
      estado: "PREENCHIDA",
      execucoes: [
        {
          lado: "COMPRA",
          preco: dec("100"),
          quantidade: dec("0.5"),
          taxaCotacao: dec("0.05"),
          em: api.relogio.t,
        },
      ],
    });

    const lista = await chamar(ana, "GET", `/decisoes?roboId=${roboId}&limite=10`);
    expect(lista.json()).toHaveLength(2);
    expect((await chamar(ana, "GET", "/decisoes?estado=aguardando_aprovacao")).json()).toHaveLength(1);
    expect((await chamar(ana, "GET", "/decisoes?limite=500")).statusCode).toBe(400);
    expect((await chamar(beto, "GET", "/decisoes")).json()).toEqual([]);
    const detalhe = await chamar(ana, "GET", `/decisoes/${registrada}`);
    expect(detalhe.json()).toMatchObject({ ordem: { idCliente: "zt-api-1", estado: "PREENCHIDA" } });

    expect((await chamar(beto, "POST", `/decisoes/${aguardando}/aprovar`)).statusCode).toBe(404);
    const aprovada = await chamar(ana, "POST", `/decisoes/${aguardando}/aprovar`);
    expect(aprovada.json()).toMatchObject({ estado: "aprovada" });
    const recusar = await chamar(ana, "POST", `/decisoes/${aguardando}/recusar`);
    expect(recusar.statusCode).toBe(409);
    expect(recusar.json()).toMatchObject({ erro: { codigo: "estado_invalido" } });

    const ordens = await chamar(ana, "GET", `/ordens?roboId=${roboId}`);
    expect(ordens.json()).toHaveLength(1);
    expect((await chamar(ana, "GET", "/ordens")).json()).toHaveLength(1);
  });

  it("posição derivada e resumo do dia", async () => {
    const posicao = await chamar(ana, "GET", `/robos/${roboId}/posicao`);
    expect(posicao.json()).toEqual({
      roboId,
      simbolo: "BTCUSDT",
      quantidade: "0.5",
      precoMedio: "100",
      resultadoRealizado: "-0.05",
      taxasPagas: "0.05",
    });
    const resumo = await chamar(ana, "GET", "/resumo");
    expect(resumo.json()).toMatchObject({
      exposicao: "50",
      robosAtivos: 1,
      paradaTotal: false,
      taxasHoje: "0.05",
    });
  });

  it("patrimônio: curva diária do resultado realizado, com teto de dias", async () => {
    const curva = await chamar(ana, "GET", "/patrimonio");
    expect(curva.statusCode).toBe(200);
    expect(curva.json<{ valor: string }[]>().map((p) => p.valor)).toEqual(["0", "-0.05"]);
    expect((await chamar(beto, "GET", "/patrimonio?dias=7")).json()).toEqual([]);
    expect((await chamar(ana, "GET", "/patrimonio?dias=0")).statusCode).toBe(400);
    expect((await chamar(ana, "GET", "/patrimonio?dias=366")).statusCode).toBe(400);
  });

  it("candles do mercado pelo período", async () => {
    const base = Date.UTC(2026, 0, 1);
    await api.banco.mercado.gravar("ETHUSDT", "1h", [
      {
        abertura: base,
        fechamento: base + 3_599_999,
        abre: dec("1"),
        maxima: dec("2"),
        minima: dec("0.5"),
        fecha: dec("1.5"),
        volume: dec("10"),
      },
    ]);
    const r = await chamar(
      ana,
      "GET",
      `/mercado/ETHUSDT/candles?intervalo=1h&inicio=${base}&fim=${base + 7_200_000}`,
    );
    expect(r.json()).toEqual([
      { abertura: base, abre: "1", maxima: "2", minima: "0.5", fecha: "1.5", volume: "10" },
    ]);
    expect((await chamar(ana, "GET", "/mercado/ETHUSDT/candles?intervalo=1h")).statusCode).toBe(200);
    const invertido = await chamar(ana, "GET", `/mercado/ETHUSDT/candles?intervalo=1h&inicio=10&fim=5`);
    expect(invertido.json()).toMatchObject({ erro: { codigo: "periodo_invalido" } });
    expect((await chamar(ana, "GET", "/mercado/eth/candles?intervalo=1h")).statusCode).toBe(400);
  });

  it("parada total: ligar avisa o n8n; ler devolve o estado", async () => {
    const ligar = await chamar(beto, "POST", "/parada-total", { ligada: true });
    expect(ligar.json()).toEqual({ ligada: true });
    expect(api.n8n.alertas.at(-1)).toMatchObject({ tipo: "parada_total", titulo: "Parada total ligada" });
    expect((await chamar(beto, "GET", "/parada-total")).json()).toEqual({ ligada: true });
    expect((await chamar(ana, "GET", "/parada-total")).json()).toEqual({ ligada: false });
  });

  it("contas da corretora: cadastro crítico, nunca devolve o segredo; dinheiro real exige 2FA", async () => {
    const conta = {
      corretora: "binance",
      rede: "testnet",
      apiKey: "chave-publica-9z8y",
      apiSecret: "segredo-secreto-123",
    };
    const criada = await chamar(ana, "POST", "/contas-corretora", conta);
    expect(criada.statusCode).toBe(201);
    expect(criada.json()).toMatchObject({ apiKeyFinal: "…9z8y" });
    expect(JSON.stringify(criada.json())).not.toContain("segredo");
    const lista = await chamar(ana, "GET", "/contas-corretora");
    expect(JSON.stringify(lista.json())).not.toContain("segredo-secreto");
    expect((await chamar(ana, "POST", "/contas-corretora", conta)).statusCode).toBe(409);

    const semReauth = await chamar(beto, "POST", "/contas-corretora", conta);
    expect(semReauth.json()).toMatchObject({ erro: { codigo: "reautenticacao_necessaria" } });
    expect((await chamar(beto, "POST", "/sessao/confirmar", { senha: SENHA })).statusCode).toBe(204);
    const realSem2fa = await chamar(beto, "POST", "/contas-corretora", { ...conta, rede: "real" });
    expect(realSem2fa.json()).toMatchObject({ erro: { codigo: "2fa_obrigatorio" } });
    const id = criada.json<{ id: string }>().id;
    expect((await chamar(beto, "DELETE", `/contas-corretora/${id}`)).statusCode).toBe(404);
    expect((await chamar(ana, "DELETE", `/contas-corretora/${id}`)).statusCode).toBe(204);
  });

  it("backtest: grava na fila e enfileira { backtestId } no BullMQ", async () => {
    const pedido = {
      estrategiaId,
      versao: 1,
      simbolo: "BTCUSDT",
      intervalo: "1h",
      inicio: 0,
      fim: 86_400_000,
    };
    const r = await chamar(ana, "POST", "/backtests", pedido);
    expect(r.statusCode).toBe(202);
    const { id, estado } = r.json<{ id: string; estado: string }>();
    expect(estado).toBe("na_fila");
    expect(r.json()).toMatchObject({ simbolo: "BTCUSDT", metricas: null, curva: null, erro: null });
    const conexao = new Redis(api.redisUrl, { maxRetriesPerRequest: null });
    const fila = new Queue("backtests", { connection: conexao });
    try {
      const job = await fila.getJob(id);
      expect(job?.data).toEqual({ backtestId: id });
    } finally {
      await fila.close();
      await conexao.quit();
    }
    expect((await chamar(ana, "GET", `/backtests/${id}`)).json()).toMatchObject({ id, estado: "na_fila" });
    expect((await chamar(beto, "GET", `/backtests/${id}`)).statusCode).toBe(404);
    expect((await chamar(beto, "POST", "/backtests", pedido)).statusCode).toBe(400);
    expect((await chamar(ana, "GET", "/backtests")).json()).toMatchObject([{ id, estado: "na_fila" }]);
    expect((await chamar(beto, "GET", "/backtests")).json()).toEqual([]);
    expect((await chamar(ana, "GET", "/backtests?limite=51")).statusCode).toBe(400);
  });

  it("backtest concluído sai com as métricas do contrato", async () => {
    const [b] = await api.banco.backtests.listar(ana.id);
    const metricas = {
      resultadoLiquido: "12.3",
      patrimonioFinal: "1012.3",
      maiorQueda: "4",
      maiorQuedaPercentual: 0.004,
      operacoes: 3,
      acertos: 2,
      taxaAcerto: 0.6667,
      taxasPagas: "1.2",
    };
    await api.banco.backtests.concluir(b!.id, { metricas, curva: [{ em: 1, patrimonio: "1000" }] });
    const lido = await chamar(ana, "GET", `/backtests/${b!.id}`);
    expect(lido.json()).toMatchObject({
      estado: "concluido",
      metricas,
      curva: [{ em: 1, patrimonio: "1000" }],
      // Pedido sem configuração: a API gravou os padrões (custos realistas, limites do robô).
      configuracao: {
        custos: { taxaPorLado: 0.001, deslizamentoBps: 5, meioSpreadBps: 2 },
        risco: { modo: "robo" },
        validacao: { fracaoDentroDaAmostra: 0.7 },
      },
      // Backtest sem Sharpe gravado conta como tentativa, mas sem Sharpe deflacionado.
      tentativas: { total: 1, daVersao: 1, versoes: 1, sharpeDeflacionado: null },
    });
  });

  it("backtest com configuração própria; cada rodada concluída conta como tentativa", async () => {
    const DIA = 86_400_000;
    const pedido = {
      estrategiaId,
      versao: 1,
      simbolo: "ETHUSDT",
      intervalo: "4h",
      inicio: 0,
      fim: 400 * DIA,
      configuracao: {
        custos: { taxaPorLado: 0.00075, deslizamentoBps: 10 },
        risco: { modo: "sem_limites" },
        validacao: { fracaoDentroDaAmostra: 0.8, janelas: 4, modoJanelas: "ancorada", semente: 7 },
      },
    };
    const r = await chamar(ana, "POST", "/backtests", pedido);
    expect(r.statusCode).toBe(202);
    expect(r.json()).toMatchObject({
      configuracao: {
        custos: { taxaPorLado: 0.00075, deslizamentoBps: 10, meioSpreadBps: 2 },
        risco: { modo: "sem_limites" },
        precisaoMinuto: false,
        validacao: { fracaoDentroDaAmostra: 0.8, janelas: 4, modoJanelas: "ancorada", semente: 7 },
      },
      validacao: null,
      tentativas: null,
    });
    const minutoLongo = { ...pedido, configuracao: { precisaoMinuto: true } };
    const recusado = await chamar(ana, "POST", "/backtests", minutoLongo);
    expect(recusado.statusCode).toBe(400);
    expect(JSON.stringify(recusado.json())).toMatch(/31 dias/);
    const fracaoRuim = { ...pedido, configuracao: { validacao: { fracaoDentroDaAmostra: 0.99 } } };
    expect((await chamar(ana, "POST", "/backtests", fracaoRuim)).statusCode).toBe(400);

    const metricas = (sharpe: number) => ({
      resultadoLiquido: "40",
      maiorQueda: "10",
      maiorQuedaPercentual: 0.01,
      operacoes: 150,
      acertos: 80,
      taxaAcerto: 0.5333,
      taxasPagas: "3",
      sharpe,
      observacoes: 2400,
      barrasPorAno: 2190,
      assimetria: -0.2,
      curtose: 5,
      anos: 400 / 365,
    });
    const id = r.json<{ id: string }>().id;
    await api.banco.backtests.concluir(id, { metricas: metricas(1.8), curva: [] });
    const segundo = await chamar(ana, "POST", "/backtests", pedido);
    const id2 = segundo.json<{ id: string }>().id;
    await api.banco.backtests.concluir(id2, { metricas: metricas(0.2), curva: [] });
    const lido = await chamar(ana, "GET", `/backtests/${id2}`);
    const t = lido.json<{ tentativas: Record<string, number | null> }>().tentativas;
    // O primeiro backtest desta estratégia (sem Sharpe) + estes dois.
    expect(t).toMatchObject({ total: 3, daVersao: 3, versoes: 1 });
    expect(t.sharpeDeflacionado).toBeLessThan(t.probabilidadeSharpe ?? 0);
    const lista = (await chamar(ana, "GET", "/backtests")).json<{ id: string; tentativas: unknown }[]>();
    expect(lista.find((x) => x.id === id)?.tentativas).toMatchObject({ total: 2 });
    expect((await chamar(beto, "GET", `/backtests/${id2}`)).statusCode).toBe(404);
  });

  it("conhecimento: nota vira documento com trechos; repetida não duplica", async () => {
    const nota = { titulo: "Fim de semana", texto: "Liquidez baixa no sábado.\n\nSpread alto." };
    const criada = await chamar(ana, "POST", "/conhecimento/notas", nota);
    expect(criada.statusCode).toBe(201);
    expect(criada.json()).toMatchObject({ titulo: "Fim de semana", fonte: "nota", novo: true, trechos: 1 });
    // Mesmo conteúdo com espaços e quebras diferentes: o normalizador do RAG deduplica.
    const repetida = await chamar(ana, "POST", "/conhecimento/notas", {
      ...nota,
      texto: "Liquidez baixa  no sábado.\r\n\r\nSpread alto.  ",
    });
    expect(repetida.statusCode).toBe(200);
    expect(repetida.json()).toMatchObject({ id: criada.json<{ id: string }>().id, novo: false, trechos: 0 });
    const docs = await chamar(ana, "GET", "/conhecimento/documentos");
    expect(docs.json()).toMatchObject([{ titulo: "Fim de semana", fonte: "nota" }]);
    expect((await chamar(beto, "GET", "/conhecimento/documentos")).json()).toEqual([]);
    expect(
      (await chamar(ana, "POST", "/conhecimento/notas", { titulo: "x", texto: "  \n\n " })).statusCode,
    ).toBe(400);
  });

  it("saúde é pública e diz o que está de pé", async () => {
    const r = await api.app.inject({ method: "GET", url: "/api/v1/saude" });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({
      ok: true,
      servicos: { banco: true, redis: true, motor: false, agente: false },
      conhecimento: "hibrida",
    });
  });

  it("a senha continua só no hash (sanidade do comando de criação)", async () => {
    const [linha] = await api.banco.conexao
      .sql`select senha_hash from usuarios where email = 'ana@exemplo.com'`;
    expect(String(linha!.senha_hash)).toMatch(/^\$argon2id\$/);
    expect(String(linha!.senha_hash)).not.toContain(SENHA);
  });
});
