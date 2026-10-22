import { portaPensamentos } from "@zentrade/banco";
import type { NovaDecisao } from "@zentrade/contratos";
import { dec, type PensamentoRobo } from "@zentrade/dominio";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { comSessao, embeddingsFalsos, montarApi, type Api, type Pessoa } from "./ajuda.js";

const HORA = 3_600_000;
const T0 = Date.UTC(2026, 9, 20, 12, 0);

const cenario = (nome: "alta" | "lateral") => ({
  cenario: nome,
  precoVsSma200: -0.4,
  precoVsSma400: null,
  inclinacaoSma200: 0,
  limiarInclinacao: 0.5,
  variacao7d: 0,
  janelaVariacaoHoras: 168,
  atrPct: 1,
  atrPercentil: 50,
  eficiencia: 0.1,
  texto: "Lateral: o preço está 0,4% abaixo da média de 200 velas, que está quase parada.",
});

const pensamento = (i: number, nome: "alta" | "lateral"): PensamentoRobo => ({
  em: T0 + i * HORA,
  preco: "100",
  sinal: "AGUARDAR",
  posicionado: false,
  regraAvaliada: "entrada",
  condicoes: { tipo: "condicao", valor: false, texto: "preço (100) > SMA(200) (101)" },
  cenario: cenario(nome),
  agente: "decide",
  explicacao: "x",
  conclusao: "Fico de fora: não é verdade que preço (100) > SMA(200) (101).",
});

describe("rotas do pensamento do robô e a decisão com o cenário", () => {
  let api: Api;
  let ana: Pessoa;
  let beto: Pessoa;
  let roboId: string;
  let decisaoId: string;

  const ler = (p: Pessoa, url: string) =>
    api.app.inject({ method: "GET", url: `/api/v1${url}`, headers: comSessao(p) });

  beforeAll(async () => {
    api = await montarApi({ embeddings: embeddingsFalsos });
    ana = await api.pessoa("ana@exemplo.com");
    beto = await api.pessoa("beto@exemplo.com");
    const estrategia = await api.banco.estrategias.criar(ana.id, {
      nome: "Acima da média",
      entrada: {
        tipo: "comparar",
        esquerda: { tipo: "preco" },
        comparador: ">",
        direita: { tipo: "indicador", nome: "sma", periodo: 200 },
      },
      stop: 0.02,
      alvoLiquido: 0.01,
      taxa: 0.001,
    });
    const robo = await api.banco.robos.criar(ana.id, {
      nome: "BTC 1h",
      simbolo: "BTCUSDT",
      intervalo: "1h",
      modo: "observar",
      rede: "papel",
      estrategiaId: estrategia.id,
      estrategiaVersao: 1,
      limites: {
        perdaDiariaMaxima: "50",
        exposicaoMaxima: "1000",
        riscoPorOperacao: "10",
        ordensPorHoraMax: 6,
        pausaAposPerdaMin: 30,
        confiancaMinima: 0.6,
        diasDeEvento: "ignorar",
        agente: "decide",
      },
    });
    roboId = robo.id;
    const porta = portaPensamentos(api.banco.conexao.db);
    await porta.registrar(roboId, pensamento(0, "lateral"));
    await porta.registrar(roboId, pensamento(1, "alta"));
    const nova: NovaDecisao = {
      roboId,
      em: T0,
      sinal: { acao: "COMPRAR", stop: dec(98), alvo: dec(102), explicacao: "rompeu" },
      preco: dec(100),
      risco: { aprovada: true, barreiras: [] },
      estado: "registrada",
      regime: cenario("lateral"),
      condicoes: { tipo: "condicao", valor: true, texto: "preço (100) > SMA(200) (99)" },
    };
    decisaoId = await api.banco.portas.decisoes.registrar(nova);
  });
  afterAll(async () => api.encerrar());

  it("GET /pensamentos: a última leitura de cada robô, com o nome do ativo", async () => {
    const r = await ler(ana, "/pensamentos");
    expect(r.statusCode).toBe(200);
    const lista = r.json();
    expect(lista).toHaveLength(1);
    expect(lista[0]).toMatchObject({ roboId, simbolo: "BTCUSDT", intervalo: "1h" });
    expect(lista[0].pensamento.cenario.cenario).toBe("alta");
    expect(lista[0].pensamento.condicoes.texto).toBe("preço (100) > SMA(200) (101)");
  });

  it("GET /robos/:id/pensamentos: o histórico curto, do mais novo ao mais velho", async () => {
    const r = await ler(ana, `/robos/${roboId}/pensamentos`);
    expect(r.statusCode).toBe(200);
    expect(r.json().map((h: { motivo: string }) => h.motivo)).toEqual(["cenario", "inicio"]);
  });

  it("GET /cenarios: o cenário por ativo e intervalo", async () => {
    const r = await ler(ana, "/cenarios");
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual([
      expect.objectContaining({ simbolo: "BTCUSDT", intervalo: "1h", roboIds: [roboId] }),
    ]);
  });

  it("outra pessoa não vê nada e o robô dela dá 404", async () => {
    expect((await ler(beto, "/pensamentos")).json()).toEqual([]);
    expect((await ler(beto, "/cenarios")).json()).toEqual([]);
    expect((await ler(beto, `/robos/${roboId}/pensamentos`)).statusCode).toBe(404);
    expect((await ler(ana, "/robos/nao-e-uuid/pensamentos")).statusCode).toBe(404);
  });

  it("sem sessão: 401", async () => {
    const r = await api.app.inject({ method: "GET", url: "/api/v1/pensamentos" });
    expect(r.statusCode).toBe(401);
  });

  it("o detalhe da decisão traz o cenário e as condições do momento", async () => {
    const r = await ler(ana, `/decisoes/${decisaoId}`);
    expect(r.statusCode).toBe(200);
    const d = r.json();
    expect(d.regime.cenario).toBe("lateral");
    expect(d.condicoes.texto).toBe("preço (100) > SMA(200) (99)");
    expect(d.sinal.explicacao).toBe("rompeu");
  });
});
