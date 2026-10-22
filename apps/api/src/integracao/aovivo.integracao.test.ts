import { CANAL_EVENTOS, type Evento } from "@zentrade/contratos";
import { dec } from "@zentrade/dominio";
import { Redis } from "ioredis";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { RegistroAoVivo } from "../integracoes/historico-eventos.js";
import { montarApi, type Api, type Pessoa } from "./ajuda.js";

const LIMITES = {
  perdaDiariaMaxima: "10",
  exposicaoMaxima: "100",
  riscoPorOperacao: "1",
  ordensPorHoraMax: 5,
  pausaAposPerdaMin: 0,
  confiancaMinima: 0.5,
  diasDeEvento: "ignorar" as const,
  agente: "decide" as const,
};

describe("ao vivo: histórico recente por robô", () => {
  let api: Api;
  let ana: Pessoa;
  let beto: Pessoa;
  let roboAna: string;
  let outroRoboAna: string;
  let publicador: Redis;

  async function criarRobo(dona: Pessoa, nome: string): Promise<string> {
    const estrategia = await api.banco.estrategias.criar(dona.id, {
      nome: `e-${nome}`,
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
    const robo = await api.banco.robos.criar(dona.id, {
      nome,
      simbolo: "BTCUSDT",
      intervalo: "15m",
      modo: "observar",
      rede: "papel",
      estrategiaId: estrategia.id,
      estrategiaVersao: 1,
      limites: LIMITES,
    });
    return robo.id;
  }

  const recentes = (p: Pessoa, caminho: string) =>
    api.app.inject({ method: "GET", url: `/api/v1/aovivo/${caminho}`, headers: { cookie: p.cookie } });
  const eventosDe = async (p: Pessoa, caminho: string) =>
    (await recentes(p, caminho)).json<{ eventos: RegistroAoVivo[] }>().eventos.map((r) => r.evento.tipo);
  const publicar = (e: Evento) => publicador.publish(CANAL_EVENTOS, JSON.stringify(e));

  beforeAll(async () => {
    api = await montarApi();
    ana = await api.pessoa("ana.aovivo@exemplo.com");
    beto = await api.pessoa("beto.aovivo@exemplo.com");
    roboAna = await criarRobo(ana, "vigia");
    outroRoboAna = await criarRobo(ana, "paciente");
    publicador = new Redis(api.redisUrl);
  });
  afterAll(async () => {
    await publicador.quit();
    await api.encerrar();
  });

  it("guarda o que chega no canal, por robô e em ordem; a ordem acha o robô pela decisão", async () => {
    const candle = { abertura: 1, abre: "1", maxima: "2", minima: "0.5", fecha: "1.5", volume: "3" };
    await publicar({ tipo: "candle", roboId: roboAna, simbolo: "BTCUSDT", intervalo: "15m", candle });
    await publicar({ tipo: "sinal", roboId: roboAna, acao: "COMPRAR", explicacao: "x", preco: "1.5", em: 2 });
    await publicar({ tipo: "preco", simbolo: "BTCUSDT", preco: "1.5", em: 2 });
    const id = await api.banco.portas.decisoes.registrar({
      roboId: roboAna,
      em: api.relogio.t,
      sinal: { acao: "AGUARDAR", explicacao: "nada" },
      preco: dec("1.5"),
      risco: { aprovada: true, barreiras: [] },
      estado: "registrada",
    });
    const decisao = await api.banco.decisoes.obter(ana.id, id);
    const { ordem: _, ...dto } = decisao!;
    // Ordem de uma decisão que o histórico nunca viu: o robô sai do banco.
    await publicar({
      tipo: "ordem",
      ordem: {
        id: "o-1",
        decisaoId: dto.id,
        idCliente: "zt-o-1",
        simbolo: "BTCUSDT",
        lado: "COMPRA",
        quantidade: "0.1",
        estado: "PENDENTE",
        criadaEm: 3,
        execucoes: [],
      },
    });
    await publicar({ tipo: "decisao", decisao: dto });
    await publicar({
      tipo: "sinal",
      roboId: outroRoboAna,
      acao: "AGUARDAR",
      explicacao: "y",
      preco: "1",
      em: 4,
    });

    // O último publicado é o sinal do outro robô: só depois dele o histórico está completo.
    await expect.poll(async () => (await eventosDe(ana, "recentes")).length, { timeout: 10_000 }).toBe(5);
    expect(await eventosDe(ana, `${roboAna}/recentes`)).toEqual(["candle", "sinal", "ordem", "decisao"]);
    expect(await eventosDe(ana, `${outroRoboAna}/recentes`)).toEqual(["sinal"]);
    expect(await eventosDe(ana, `${roboAna}/recentes?limite=2`)).toEqual(["ordem", "decisao"]);
    const todos = await eventosDe(ana, "recentes");
    expect(todos).toHaveLength(5);
    expect(todos.at(-1)).toBe("sinal");
  });

  it("só a dona vê: outra pessoa recebe 404 e uma lista vazia em 'todos'", async () => {
    expect((await recentes(beto, `${roboAna}/recentes`)).statusCode).toBe(404);
    expect(await eventosDe(beto, "recentes")).toEqual([]);
    expect((await recentes(ana, "nao-e-uuid/recentes")).statusCode).toBe(404);
    const anonimo = await api.app.inject({ method: "GET", url: `/api/v1/aovivo/${roboAna}/recentes` });
    expect(anonimo.statusCode).toBe(401);
    expect((await recentes(ana, `${roboAna}/recentes?limite=0`)).statusCode).toBe(400);
  });

  it("ordem de uma decisão que não existe não entra em robô nenhum", async () => {
    const antes = await eventosDe(ana, "recentes");
    await publicar({
      tipo: "ordem",
      ordem: {
        id: "o-2",
        decisaoId: "7a1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b",
        idCliente: "zt-o-2",
        simbolo: "BTCUSDT",
        lado: "VENDA",
        quantidade: "0.1",
        estado: "PENDENTE",
        criadaEm: 5,
        execucoes: [],
      },
    });
    await publicar({ tipo: "sinal", roboId: roboAna, acao: "AGUARDAR", explicacao: "z", preco: "1", em: 6 });
    await expect.poll(async () => (await eventosDe(ana, "recentes")).length).toBe(antes.length + 1);
    expect((await eventosDe(ana, "recentes")).at(-1)).toBe("sinal");
  });
});
