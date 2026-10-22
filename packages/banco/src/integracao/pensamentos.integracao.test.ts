import { LIMITE_HISTORICO_PENSAMENTO, type NovaDecisao } from "@zentrade/contratos";
import { dec, type PensamentoRobo } from "@zentrade/dominio";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { portaPensamentos } from "../portas/pensamentos.js";
import { montarCenario, type Cenario } from "./ajuda.js";

const T0 = Date.UTC(2026, 9, 20, 12, 0);
const HORA = 3_600_000;

const cenario = (nome: "alta" | "queda" | "lateral") => ({
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
  texto: `${nome}: texto`,
});

const pensamento = (
  i: number,
  nome: "alta" | "queda" | "lateral",
  sinal: PensamentoRobo["sinal"] = "AGUARDAR",
) =>
  ({
    em: T0 + i * HORA,
    preco: "100",
    sinal,
    posicionado: false,
    regraAvaliada: "entrada",
    condicoes: { tipo: "condicao", valor: false, texto: "preço (100) > SMA(200) (101)" },
    cenario: cenario(nome),
    agente: "decide",
    explicacao: "x",
    conclusao: "Fico de fora.",
  }) satisfies PensamentoRobo;

describe("pensamento do robô no banco", () => {
  let c: Cenario;
  let porta: ReturnType<typeof portaPensamentos>;

  beforeAll(async () => {
    c = await montarCenario();
    porta = portaPensamentos(c.banco.conexao.db);
  });
  afterAll(async () => c.encerrar());

  it("a primeira leitura vira atual e entra no histórico; leitura igual só regrava a atual", async () => {
    const robo = c.ana.robo.id;
    await porta.registrar(robo, pensamento(0, "lateral"));
    await porta.registrar(robo, pensamento(1, "lateral"));
    await porta.registrar(robo, pensamento(2, "lateral"));
    const atuais = await c.banco.pensamentos.atuais(c.ana.id);
    expect(atuais).toHaveLength(1);
    expect(atuais[0]).toMatchObject({ roboId: robo, simbolo: "BTCUSDT", intervalo: "1h" });
    expect(atuais[0]?.pensamento.em).toBe(T0 + 2 * HORA);
    const historico = await c.banco.pensamentos.historico(c.ana.id, robo);
    expect(historico.map((h) => h.motivo)).toEqual(["inicio"]);
  });

  it("mudança de cenário e sinal de operar entram no histórico, do mais novo ao mais velho", async () => {
    const robo = c.ana.robo.id;
    await porta.registrar(robo, pensamento(3, "alta"));
    await porta.registrar(robo, pensamento(4, "alta", "COMPRAR"));
    const historico = await c.banco.pensamentos.historico(c.ana.id, robo);
    expect(historico.map((h) => h.motivo)).toEqual(["sinal", "cenario", "inicio"]);
    expect(historico[0]?.pensamento.condicoes?.texto).toBe("preço (100) > SMA(200) (101)");
  });

  it("o cenário por ativo sai da leitura mais recente dos robôs", async () => {
    const cenarios = await c.banco.pensamentos.cenarios(c.ana.id);
    expect(cenarios).toHaveLength(1);
    expect(cenarios[0]).toMatchObject({ simbolo: "BTCUSDT", intervalo: "1h", roboIds: [c.ana.robo.id] });
    expect(cenarios[0]?.cenario.cenario).toBe("alta");
  });

  it("uma pessoa não vê o pensamento da outra (RLS)", async () => {
    await porta.registrar(c.beto.robo.id, pensamento(0, "queda"));
    const doBeto = await c.banco.pensamentos.atuais(c.beto.id);
    expect(doBeto.map((a) => a.roboId)).toEqual([c.beto.robo.id]);
    expect(await c.banco.pensamentos.historico(c.beto.id, c.ana.robo.id)).toEqual([]);
    expect(await c.banco.pensamentos.atuais(c.ana.id)).toHaveLength(1);
  });

  it("o histórico guarda só as últimas leituras de cada robô", async () => {
    const robo = c.beto.robo.id;
    for (let i = 1; i <= LIMITE_HISTORICO_PENSAMENTO + 5; i++)
      await porta.registrar(robo, pensamento(i, i % 2 === 0 ? "alta" : "queda"));
    const historico = await c.banco.pensamentos.historico(c.beto.id, robo, 200);
    expect(historico).toHaveLength(LIMITE_HISTORICO_PENSAMENTO);
    expect(historico[0]?.pensamento.em).toBe(T0 + (LIMITE_HISTORICO_PENSAMENTO + 5) * HORA);
  });

  it("robô que não existe: erro claro, nada gravado", async () => {
    await expect(
      porta.registrar("00000000-0000-4000-8000-000000000000", pensamento(0, "alta")),
    ).rejects.toThrow(/não existe/);
  });

  it("a decisão grava o cenário e as condições junto, e a leitura devolve; a antiga continua válida", async () => {
    const d = c.banco.portas.decisoes;
    const nova: NovaDecisao = {
      roboId: c.ana.robo.id,
      em: T0,
      sinal: { acao: "COMPRAR", stop: dec("98"), alvo: dec("102"), explicacao: "rompeu" },
      preco: dec("100"),
      risco: { aprovada: true, barreiras: [] },
      estado: "registrada",
      regime: cenario("alta"),
      condicoes: { tipo: "condicao", valor: true, texto: "preço (100) > SMA(200) (99)" },
    };
    const comRegime = await d.registrar(nova);
    const { regime: _r, condicoes: _c, ...antiga } = nova;
    const semRegime = await d.registrar({ ...antiga, em: T0 + 1 });
    const a = await c.banco.decisoes.obter(c.ana.id, comRegime);
    expect(a?.regime?.cenario).toBe("alta");
    expect(a?.condicoes?.texto).toBe("preço (100) > SMA(200) (99)");
    const b = await c.banco.decisoes.obter(c.ana.id, semRegime);
    expect(b?.regime).toBeUndefined();
    expect(b?.condicoes).toBeUndefined();
  });
});
