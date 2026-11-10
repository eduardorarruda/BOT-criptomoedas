import { avaliar, contextoDeCandles, dec, type Candle, type Estrategia, type Regra } from "@zentrade/dominio";
import { describe, expect, it } from "vitest";
import { brasilia, pregao, type Vela } from "../teste/win.js";
import { CorretoraB3Papel } from "./corretora-b3-papel.js";
import { acumular, memorizar, type FonteVelasB3 } from "./fonte.js";
import { emReais, estrategiaNoPregao, SIMBOLO_WIN_PAPEL, velasFechadas } from "./mercado.js";

const DIA = "2026-11-10";
const SESSAO = { inicioEntradas: "09:15", fimEntradas: "17:30", zeragem: "18:15", pularLeilaoAbertura: true };
const sempre: Regra = {
  tipo: "comparar",
  esquerda: { tipo: "preco" },
  comparador: ">",
  direita: { tipo: "numero", valor: 0 },
};
const nunca: Regra = { tipo: "nao", regra: sempre };
const base: Estrategia = { entrada: sempre, saida: nunca, stop: 0.1, alvoLiquido: 0.6, taxa: 0 };
const QUINZE = 15 * 60_000;
const HORA = 60 * 60_000;

function velaUnica(abertura: number, ms: number): Candle {
  return {
    abertura,
    fechamento: abertura + ms - 1,
    abre: dec(1),
    maxima: dec(1),
    minima: dec(1),
    fecha: dec(1),
    volume: dec(1),
  };
}
/** O contexto de um candle de `ms` que abriu às `hhmm` (aqui só o instante importa). */
const ctxAs = (hhmm: string, ms: number) => ({
  ...contextoDeCandles([velaUnica(brasilia(DIA, hhmm), ms)]),
  fuso: "America/Sao_Paulo",
});
const p = (x: number): Vela => ({ o: x, h: x, l: x, c: x });

describe("estratégia no pregão da B3 (sessão e zeragem como no backtest do WIN)", () => {
  it("15m: entra só com a ordem saindo entre 09:15 e 17:30, e nunca no candle do leilão (09:00)", () => {
    const e = estrategiaNoPregao(base, "15m", SESSAO);
    expect(avaliar(e.entrada, ctxAs("08:45", QUINZE)).valor).toBe(false);
    expect(avaliar(e.entrada, ctxAs("09:00", QUINZE)).valor).toBe(false);
    expect(avaliar(e.entrada, ctxAs("09:15", QUINZE)).valor).toBe(true);
    expect(avaliar(e.entrada, ctxAs("17:00", QUINZE)).valor).toBe(true);
    expect(avaliar(e.entrada, ctxAs("17:15", QUINZE)).valor).toBe(false);
  });

  it("15m: zera no candle que fecha às 18:15; antes disso vale só a saída da regra", () => {
    const e = estrategiaNoPregao(base, "15m", SESSAO);
    expect(avaliar(e.saida as Regra, ctxAs("17:45", QUINZE)).valor).toBe(false);
    expect(avaliar(e.saida as Regra, ctxAs("18:00", QUINZE)).valor).toBe(true);
  });

  it("1h: zera no primeiro candle que termina depois das 18:15 (o das 18:00); entra das 10:00 às 16:00", () => {
    const e = estrategiaNoPregao(base, "1h", SESSAO);
    expect(avaliar(e.saida as Regra, ctxAs("17:00", HORA)).valor).toBe(false);
    expect(avaliar(e.saida as Regra, ctxAs("18:00", HORA)).valor).toBe(true);
    expect(avaliar(e.entrada, ctxAs("09:00", HORA)).valor).toBe(false);
    expect(avaliar(e.entrada, ctxAs("10:00", HORA)).valor).toBe(true);
    expect(avaliar(e.entrada, ctxAs("16:00", HORA)).valor).toBe(true);
    expect(avaliar(e.entrada, ctxAs("17:00", HORA)).valor).toBe(false);
  });

  it("sem regra de saída, a zeragem vira a saída", () => {
    const { saida: _s, ...semSaida } = base;
    const e = estrategiaNoPregao(semSaida, "15m", SESSAO);
    expect(avaliar(e.saida as Regra, ctxAs("18:00", QUINZE)).valor).toBe(true);
  });
});

describe("velas da B3", () => {
  it("em reais por contrato: pontos × 0,20 (o volume não muda)", () => {
    const c = pregao(DIA, "10:00", [{ o: 180_000, h: 180_500, l: 179_500, c: 180_250 }])[0] as Candle;
    const r = emReais(c);
    expect([r.abre, r.maxima, r.minima, r.fecha].map(String)).toEqual(["36000", "36100", "35900", "36050"]);
    expect(r.volume.toString()).toBe(c.volume.toString());
  });

  it("o candle de 15m só sai fechado: com a vela das 10:10 (a última do grupo) ou depois", () => {
    const tres = pregao(DIA, "10:00", [p(1), p(2), p(3)]);
    expect(velasFechadas(tres.slice(0, 2), "15m")).toHaveLength(0);
    const [q] = velasFechadas(tres, "15m");
    expect(q?.abertura).toBe(brasilia(DIA, "10:00"));
    expect(q?.fecha.toString()).toBe("3");
  });

  it("a vela das 18:20 (a última do pregão) fecha o candle de 1h das 18:00 sem esperar o dia seguinte", () => {
    const fim = pregao(DIA, "18:00", [p(1), p(2), p(3), p(4)]);
    expect(velasFechadas(fim.slice(0, 4), "1h")).toHaveLength(0);
    const fim5 = pregao(DIA, "18:00", [p(1), p(2), p(3), p(4), p(5)]);
    const [h] = velasFechadas(fim5, "1h");
    expect(h?.abertura).toBe(brasilia(DIA, "18:00"));
    expect(h?.fecha.toString()).toBe("5");
  });
});

function montar(velas: readonly Candle[], agora: number) {
  const fonte: FonteVelasB3 & { velas: Candle[] } = { velas: [...velas], velas5m: async () => fonte.velas };
  let relogio = agora;
  const corretora = new CorretoraB3Papel({
    fonte,
    capital: dec(60_000),
    margemPorContrato: dec(155),
    tarifaPorContrato: dec("0.25"),
    deslizamentoTicks: 0,
    contratosMaximos: 50,
    precoReferenciaPontos: 180_000,
    idadeMaximaCotacaoMs: 7 * 60_000,
    consultaMs: 0,
    agora: () => relogio,
  });
  return { corretora, fonte, avancar: (ms: number) => (relogio = ms) };
}

describe("corretora de papel da B3", () => {
  const sessao = pregao(DIA, "10:00", [p(180_000), p(180_100), p(180_200), p(180_300)]);
  const depois = brasilia(DIA, "10:20") + 10_000;

  it("candles do intervalo, em reais, só os fechados", async () => {
    const { corretora } = montar(sessao, depois);
    const c = await corretora.candles(SIMBOLO_WIN_PAPEL, "15m", 10);
    expect(c).toHaveLength(1);
    expect(c[0]?.fecha.toString()).toBe("36040");
  });

  it("comprar 2 contratos usa margem, não o valor cheio; vender dá pontos × 0,20 × 2", async () => {
    const { corretora, fonte, avancar } = montar(sessao, depois);
    await corretora.atualizar();
    expect((await corretora.saldoLivre("BRL")).toNumber()).toBeCloseTo(60_000, 0);
    const compra = await corretora.enviarOrdemMercado({
      simbolo: SIMBOLO_WIN_PAPEL,
      lado: "COMPRA",
      quantidade: dec(2),
      idCliente: "c1",
    });
    expect(compra.estado).toBe("PREENCHIDA");
    expect((await corretora.saldoLivre("BRL")).toNumber()).toBeCloseTo(60_000 - 310 - 0.5, 0);
    expect((await corretora.saldoLivre("WIN")).toString()).toBe("2");
    fonte.velas = [...sessao, ...pregao(DIA, "10:20", [p(181_300)])];
    avancar(brasilia(DIA, "10:25") + 10_000);
    await corretora.atualizar();
    const venda = await corretora.enviarOrdemMercado({
      simbolo: SIMBOLO_WIN_PAPEL,
      lado: "VENDA",
      quantidade: dec(2),
      idCliente: "v1",
    });
    expect(venda.estado).toBe("PREENCHIDA");
    // +1.000 pontos × R$ 0,20 × 2 = R$ 400, menos ~R$ 1 de tarifa nas 4 pontas
    expect((await corretora.saldoLivre("BRL")).toNumber()).toBeCloseTo(60_399, 0);
  });

  it("cotação velha: a ordem é rejeitada com o motivo, sem executar", async () => {
    const { corretora, avancar } = montar(sessao, depois);
    await corretora.atualizar();
    avancar(depois + 30 * 60_000);
    const r = await corretora.enviarOrdemMercado({
      simbolo: SIMBOLO_WIN_PAPEL,
      lado: "COMPRA",
      quantidade: dec(1),
      idCliente: "c1",
    });
    expect(r.estado).toBe("REJEITADA");
    expect(r.motivo).toMatch(/cotação do MT5 tem 3\d min/);
  });

  it("assinatura: entrega o candle do intervalo quando fecha e as velas de 5 min no fluxo de 1 min, sem repetir", async () => {
    const { corretora, fonte, avancar } = montar(sessao.slice(0, 2), brasilia(DIA, "10:10") + 10_000);
    const de15: Candle[] = [];
    const de1: Candle[] = [];
    const estados: string[] = [];
    corretora.assinarCandles(
      SIMBOLO_WIN_PAPEL,
      "15m",
      (c) => de15.push(c),
      (e) => estados.push(e),
    );
    corretora.assinarCandles(SIMBOLO_WIN_PAPEL, "1m", (c) => de1.push(c));
    await corretora.atualizar();
    expect(de15).toHaveLength(0);
    fonte.velas = sessao;
    avancar(brasilia(DIA, "10:20") + 10_000);
    await corretora.atualizar();
    expect(de15.map((c) => c.abertura)).toEqual([brasilia(DIA, "10:00")]);
    expect(de1.map((c) => c.abertura)).toEqual([brasilia(DIA, "10:10"), brasilia(DIA, "10:15")]);
    expect(estados).toContain("conectado");
    await corretora.atualizar();
    expect(de15).toHaveLength(1);
    expect(de1).toHaveLength(2);
  });
});

describe("fontes de velas do MT5", () => {
  const v = (min: number): Candle => velaUnica(brasilia(DIA, "10:00") + min * 60_000, 5 * 60_000);

  it("acumular: a janela curta do arquivo ao vivo não apaga o que já foi visto; guarda só as mais recentes", async () => {
    let janela = [v(0), v(5)];
    const f = acumular({ velas5m: async () => janela }, 3);
    expect((await f.velas5m()).length).toBe(2);
    janela = [v(10), v(15)];
    expect((await f.velas5m()).map((c) => c.abertura)).toEqual([v(5), v(10), v(15)].map((c) => c.abertura));
  });

  it("memorizar: lê o export uma vez só (e tenta de novo enquanto vier vazio)", async () => {
    let leituras = 0;
    let lista: Candle[] = [];
    const f = memorizar({ velas5m: async () => (leituras++, lista) });
    await f.velas5m();
    lista = [v(0)];
    await f.velas5m();
    await f.velas5m();
    expect(leituras).toBe(2);
  });
});
