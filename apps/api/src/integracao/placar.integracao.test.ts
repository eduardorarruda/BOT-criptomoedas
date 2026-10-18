import { portaPlacar } from "@zentrade/banco";
import type { NovaDecisao, PlacarDTO, PropostaAgente } from "@zentrade/contratos";
import { dec } from "@zentrade/dominio";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { comSessao, embeddingsFalsos, montarApi, type Api, type Pessoa } from "./ajuda.js";

const proposta = (acao: PropostaAgente["acao"], confianca: number): PropostaAgente => ({
  acao,
  confianca,
  tamanhoRelativo: 1,
  justificativa: "teste",
  riscos: [],
  fontes: [],
});

describe("GET /decisoes/placar e a avaliação em /decisoes", () => {
  let api: Api;
  let ana: Pessoa;
  let beto: Pessoa;
  let roboId: string;
  const ids: string[] = [];

  const chamar = (p: Pessoa, url: string) =>
    api.app.inject({ method: "GET", url: `/api/v1${url}`, headers: comSessao(p) });

  beforeAll(async () => {
    api = await montarApi({ embeddings: embeddingsFalsos });
    ana = await api.pessoa("ana@exemplo.com");
    beto = await api.pessoa("beto@exemplo.com");
    const estrategia = await api.banco.estrategias.criar(ana.id, {
      nome: "Rompimento",
      entrada: {
        tipo: "comparar",
        esquerda: { tipo: "preco" },
        comparador: ">",
        direita: { tipo: "numero", valor: 0 },
      },
      stop: 0.02,
      alvoLiquido: 0.01,
      taxa: 0.001,
    });
    const robo = await api.banco.robos.criar(ana.id, {
      nome: "BTC 15m",
      simbolo: "BTCUSDT",
      intervalo: "15m",
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
      },
    });
    roboId = robo.id;
    const nova = (p: PropostaAgente, em: number): NovaDecisao => ({
      roboId,
      em,
      sinal: { acao: "COMPRAR", stop: dec(98), alvo: dec(102), explicacao: "rompeu" },
      preco: dec(100),
      risco: { aprovada: true, barreiras: [] },
      estado: "registrada",
      proposta: p,
    });
    const t = api.relogio.t;
    ids.push(await api.banco.portas.decisoes.registrar(nova(proposta("comprar", 0.9), t - 3000)));
    ids.push(await api.banco.portas.decisoes.registrar(nova(proposta("aguardar", 0.7), t - 2000)));
    ids.push(await api.banco.portas.decisoes.registrar(nova(proposta("comprar", 0.6), t - 1000)));
    const porta = portaPlacar(api.banco.conexao.db);
    const concluida = (decisaoId: string, claude: "aprovou" | "vetou", resultado: number) =>
      porta.gravar({
        decisaoId,
        usuarioId: ana.id,
        claude,
        confianca: claude === "aprovou" ? 0.9 : 0.7,
        fonte: "contrafactual",
        situacao: "concluida",
        motivo: resultado > 0 ? "alvo" : "stop",
        resultado: dec(resultado),
        retorno: resultado / 100,
        barras: 4,
        moeda: "USDT",
        em: t,
      });
    await concluida(ids[0]!, "aprovou", 2);
    await concluida(ids[1]!, "vetou", -3);
  });
  afterAll(async () => api.encerrar());

  it("devolve as métricas da pessoa, com pendentes, resumo e a meta de 80%", async () => {
    const r = await chamar(ana, "/decisoes/placar");
    expect(r.statusCode).toBe(200);
    const p = r.json<PlacarDTO>();
    expect(p.meta).toBe(0.8);
    expect(p.total).toMatchObject({ decisoes: 3, avaliadas: 2, pendentes: 1, moeda: "USDT" });
    expect(p.total.aprovacoes).toMatchObject({ acertos: 1, total: 1, taxa: 1 });
    expect(p.total.vetos).toMatchObject({ acertos: 1, total: 1 });
    expect(p.total.dinheiro).toMatchObject({ aprovadas: "2", seAprovasseTudo: "-1", agregado: "3" });
    expect(p.total.resumo).toContain("você aprovou 1 e acertou 1");
    expect(p.porRobo.map((g) => g.nome)).toEqual(["BTC 15m"]);
    expect(p.porEstrategia.map((g) => g.nome)).toEqual(["Rompimento"]);
  });

  it("filtra por robô e por data; outra pessoa não vê nada", async () => {
    const desde = await chamar(ana, `/decisoes/placar?desde=${api.relogio.t - 1500}`);
    expect(desde.json<PlacarDTO>().total.decisoes).toBe(1);
    const porRobo = await chamar(ana, `/decisoes/placar?roboId=${roboId}`);
    expect(porRobo.json<PlacarDTO>().total.decisoes).toBe(3);
    const doBeto = await chamar(beto, "/decisoes/placar");
    expect(doBeto.json<PlacarDTO>().total.decisoes).toBe(0);
    expect((await chamar(ana, "/decisoes/placar?roboId=nao-e-uuid")).statusCode).toBe(400);
  });

  it("cada decisão traz a sua avaliação", async () => {
    const lista = (await chamar(ana, `/decisoes?roboId=${roboId}`)).json<
      { id: string; avaliacao?: unknown }[]
    >();
    expect(lista.find((d) => d.id === ids[1])?.avaliacao).toMatchObject({
      claude: "vetou",
      situacao: "concluida",
      acertou: true,
      resultado: "-3",
    });
    expect(lista.find((d) => d.id === ids[2])?.avaliacao).toBeUndefined();
    const detalhe = await chamar(ana, `/decisoes/${ids[0]}`);
    expect(detalhe.json()).toMatchObject({ avaliacao: { claude: "aprovou", acertou: true } });
  });
});
