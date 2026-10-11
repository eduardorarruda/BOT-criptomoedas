import { describe, expect, it } from "vitest";
import { dec } from "./dinheiro.js";
import { avaliarRisco, type EstadoRisco, type LimitesRisco, type PropostaOrdem } from "./risco.js";
import type { FiltrosAtivo } from "./tipos.js";

const filtros: FiltrosAtivo = {
  passoQuantidade: dec("0.00001"),
  quantidadeMinima: dec("0.00001"),
  valorMinimo: dec(5),
  passoPreco: dec("0.01"),
};
const limites: LimitesRisco = {
  perdaDiariaMaxima: dec(50),
  exposicaoMaxima: dec(1000),
  ordensPorHoraMax: 6,
  pausaAposPerdaMs: 15 * 60_000,
  confiancaMinima: 0.6,
};
const estado: EstadoRisco = {
  pausado: false,
  resultadoDoDia: dec(0),
  exposicaoAtual: dec(0),
  ordensUltimaHora: 0,
  ultimaPerdaEm: null,
  agora: 1_000_000_000,
};
const compra: PropostaOrdem = {
  lado: "COMPRA",
  quantidade: dec("0.005"),
  precoReferencia: dec(60000),
  stop: dec(58800),
  alvo: dec(61000),
  confianca: 0.8,
};
const taxa = 0.001;

const codigos = (r: ReturnType<typeof avaliarRisco>) => (r.aprovada ? [] : r.barreiras.map((b) => b.codigo));

describe("motor de risco", () => {
  it("aprova a compra dentro de todos os limites", () => {
    expect(avaliarRisco(compra, estado, limites, filtros, taxa)).toEqual({ aprovada: true });
  });

  it("parada total barra tudo, inclusive a venda", () => {
    expect(codigos(avaliarRisco(compra, { ...estado, pausado: true }, limites, filtros, taxa))).toContain(
      "pausado",
    );
    expect(
      codigos(
        avaliarRisco({ ...compra, lado: "VENDA" }, { ...estado, pausado: true }, limites, filtros, taxa),
      ),
    ).toContain("pausado");
  });

  it("perda do dia no limite barra compra, mas deixa vender para sair", () => {
    const ruim = { ...estado, resultadoDoDia: dec(-50) };
    expect(codigos(avaliarRisco(compra, ruim, limites, filtros, taxa))).toContain("perda_diaria");
    expect(
      avaliarRisco(
        { lado: "VENDA", quantidade: dec("0.005"), precoReferencia: dec(60000), confianca: 0 },
        ruim,
        limites,
        filtros,
        taxa,
      ),
    ).toEqual({ aprovada: true });
  });

  it("exposição: a compra não pode passar do máximo", () => {
    expect(
      codigos(avaliarRisco(compra, { ...estado, exposicaoAtual: dec(800) }, limites, filtros, taxa)),
    ).toContain("exposicao");
  });

  it("frequência vale para compra e venda", () => {
    const cheio = { ...estado, ordensUltimaHora: 6 };
    expect(codigos(avaliarRisco(compra, cheio, limites, filtros, taxa))).toContain("frequencia");
    expect(codigos(avaliarRisco({ ...compra, lado: "VENDA" }, cheio, limites, filtros, taxa))).toContain(
      "frequencia",
    );
  });

  it("pausa depois de uma perda", () => {
    const recente = { ...estado, ultimaPerdaEm: estado.agora - 60_000 };
    expect(codigos(avaliarRisco(compra, recente, limites, filtros, taxa))).toContain("pausa_apos_perda");
    const antiga = { ...estado, ultimaPerdaEm: estado.agora - 16 * 60_000 };
    expect(avaliarRisco(compra, antiga, limites, filtros, taxa)).toEqual({ aprovada: true });
  });

  it("compra exige stop abaixo do preço e alvo acima das taxas", () => {
    const { stop: _s, ...semStop } = compra;
    expect(codigos(avaliarRisco(semStop, estado, limites, filtros, taxa))).toContain("sem_stop");
    expect(codigos(avaliarRisco({ ...compra, stop: dec(60001) }, estado, limites, filtros, taxa))).toContain(
      "stop_invalido",
    );
    expect(codigos(avaliarRisco({ ...compra, alvo: dec(60050) }, estado, limites, filtros, taxa))).toContain(
      "alvo_abaixo_das_taxas",
    );
  });

  it("confiança baixa barra a compra, não a venda do stop", () => {
    expect(codigos(avaliarRisco({ ...compra, confianca: 0.3 }, estado, limites, filtros, taxa))).toContain(
      "confianca_baixa",
    );
    expect(avaliarRisco({ ...compra, lado: "VENDA", confianca: 0 }, estado, limites, filtros, taxa)).toEqual({
      aprovada: true,
    });
  });

  it("filtros da corretora: mínimo, passo e valor mínimo", () => {
    expect(
      codigos(avaliarRisco({ ...compra, quantidade: dec("0.0000001") }, estado, limites, filtros, taxa)),
    ).toEqual(expect.arrayContaining(["quantidade_minima", "passo_quantidade"]));
    expect(
      codigos(avaliarRisco({ ...compra, quantidade: dec("0.00005") }, estado, limites, filtros, taxa)),
    ).toContain("valor_minimo");
    expect(
      codigos(avaliarRisco({ ...compra, quantidade: dec(0) }, estado, limites, filtros, taxa)),
    ).toContain("quantidade_invalida");
  });

  it("junta todas as barreiras com mensagens legíveis", () => {
    const r = avaliarRisco(
      { ...compra, confianca: 0.1 },
      { ...estado, pausado: true, ordensUltimaHora: 9 },
      limites,
      filtros,
      taxa,
    );
    expect(r.aprovada).toBe(false);
    if (r.aprovada) return;
    expect(r.barreiras.length).toBeGreaterThanOrEqual(3);
    for (const b of r.barreiras) expect(b.mensagem.length).toBeGreaterThan(10);
  });
});
