import { ConfiguracaoWinEsquema } from "@zentrade/contratos";
import { dec, type Estrategia, type Regra } from "@zentrade/dominio";
import { describe, expect, it } from "vitest";
import { parada, pregao } from "../../teste/win.js";
import { modeloWinDe } from "./modelo.js";
import { rodarBacktestWin, type EntradaBacktestWin } from "./rodar.js";

const DIA = "2026-10-13";
const preco = { tipo: "preco" } as const;
const numero = (valor: number) => ({ tipo: "numero", valor }) as const;
const sempre: Regra = { tipo: "comparar", esquerda: preco, comparador: ">", direita: numero(0) };
const nunca: Regra = { tipo: "nao", regra: sempre };

/** Risco R$ 300 por operação; resto dos padrões do WIN (R$ 0,25 por lado, 1 tick de 5 pontos). */
const modelo = modeloWinDe(ConfiguracaoWinEsquema.parse({ riscoPorOperacao: "300" }));

const compra: Estrategia = {
  entrada: { tipo: "comparar", esquerda: preco, comparador: "cruzouAcima", direita: numero(130_100) },
  stop: 0.005,
  alvoLiquido: 0.01,
  taxa: 0,
};
const compraComSaida: Estrategia = {
  ...compra,
  saida: { tipo: "comparar", esquerda: preco, comparador: ">", direita: numero(130_200) },
};
const venda: Estrategia = {
  entrada: nunca,
  direcao: "vendido",
  entradaVendida: { tipo: "comparar", esquerda: preco, comparador: "cruzouAbaixo", direita: numero(129_900) },
  stop: 0.005,
  alvoLiquido: 0.01,
  taxa: 0,
};

const rodar = (candles: EntradaBacktestWin["candles"], extra: Partial<EntradaBacktestWin> = {}) =>
  rodarBacktestWin({
    simbolo: "WIN-IBOV",
    candles,
    estrategia: compra,
    modelo,
    limites: null,
    saldoInicial: dec(5000),
    execucao: "proximaAbertura",
    ...extra,
  });

describe("backtest do mini índice na abertura do candle seguinte (contas à mão)", () => {
  it("comprado: o sinal do fechamento entra na ABERTURA seguinte; a zeragem fica no fechamento", () => {
    const candles = pregao(DIA, "10:00", [
      parada(130_000),
      { o: 130_000, h: 130_130, l: 129_990, c: 130_120 }, // cruza 130.100: decide comprar
      { o: 130_125, h: 130_300, l: 130_100, c: 130_250 }, // abre 130.125: executa
      parada(130_400),
      { o: 130_400, h: 130_650, l: 130_380, c: 130_600 }, // último do pregão: zera no fechamento
    ]);
    const r = rodar(candles);
    expect(r.operacoes).toHaveLength(1);
    const op = r.operacoes[0]!;
    // entrada: abertura 130.125 + 1 tick = 130.130; stop 0,5% = 129.479,35 (650,65 pontos)
    // por contrato: 650,65 × 0,20 + 2,50 = R$ 132,63 → ⌊300 ÷ 132,63⌋ = 2 contratos
    expect(op).toMatchObject({ sentido: "comprado", contratos: 2, motivo: "zeragem", dia: DIA });
    expect(op.referenciaEntrada.toString()).toBe("130125");
    expect(op.entrada.toString()).toBe("130130");
    expect(op.abertaEm).toBe(candles[2]!.abertura);
    // zeragem no fechamento 130.600 → 130.595: 465 pontos × 0,20 × 2 = 186; tarifas 1
    expect(op.saida.toString()).toBe("130595");
    expect(op.fechadaEm).toBe(candles[4]!.fechamento);
    expect(op.resultado.toString()).toBe("185");
    expect(op.bruto.toString()).toBe("190"); // (130.600 − 130.125) × 0,40
    expect(op.deslizamento.toString()).toBe("4");
    expect(op.bruto.minus(op.tarifas).minus(op.deslizamento).equals(op.resultado)).toBe(true);
    expect(r.zeragens).toBe(1);
    // no fechamento da decisão ainda não há posição: patrimônio intacto
    expect(r.curva[1]!.patrimonio.toString()).toBe("5000");
  });

  it("saída por regra decidida no fechamento executa na abertura seguinte", () => {
    const candles = pregao(DIA, "10:00", [
      parada(130_000),
      { o: 130_000, h: 130_130, l: 129_990, c: 130_120 }, // decide comprar
      { o: 130_125, h: 130_210, l: 130_100, c: 130_205 }, // entra a 130.130; fecha acima de 130.200: decide sair
      { o: 130_180, h: 130_190, l: 130_170, c: 130_185 }, // abre 130.180: sai a 130.175
      parada(130_185),
      parada(130_185),
    ]);
    const r = rodar(candles, { estrategia: compraComSaida });
    expect(r.operacoes).toHaveLength(1);
    const op = r.operacoes[0]!;
    expect(op.motivo).not.toBe("zeragem");
    expect(op.entrada.toString()).toBe("130130");
    expect(op.referenciaSaida.toString()).toBe("130180");
    expect(op.saida.toString()).toBe("130175");
    expect(op.fechadaEm).toBe(candles[3]!.abertura);
    // 45 pontos × 0,20 × 2 = 18; tarifas 1
    expect(op.resultado.toString()).toBe("17");
    // o mesmo cenário no fechamento sairia a 130.200 (130.205 − 1 tick)
    const noFechamento = rodar(candles, { estrategia: compraComSaida, execucao: "fechamento" });
    expect(noFechamento.operacoes[0]!.saida.toString()).toBe("130200");
  });

  it("vendido: entra na abertura com 1 tick contra e o stop vale dentro do próprio candle da entrada", () => {
    const candles = pregao(DIA, "10:00", [
      parada(130_000),
      { o: 130_000, h: 130_010, l: 129_870, c: 129_880 }, // cruza 129.900 para baixo: decide vender
      { o: 129_900, h: 130_600, l: 129_850, c: 130_550 }, // abre 129.900: vende a 129.895; a máxima passa do stop
      parada(130_550),
    ]);
    const r = rodar(candles, { estrategia: venda });
    expect(r.operacoes).toHaveLength(1);
    const op = r.operacoes[0]!;
    // stop 129.895 × 1,005 = 130.544,475 → recompra 130.545 + 5 = 130.550; 2 contratos
    expect(op).toMatchObject({ sentido: "vendido", contratos: 2, motivo: "stop" });
    expect(op.entrada.toString()).toBe("129895");
    expect(op.referenciaSaida.toString()).toBe("130544.475");
    expect(op.saida.toString()).toBe("130550");
    // −655 pontos × 0,20 × 2 = −262; −1 de tarifas
    expect(op.resultado.toString()).toBe("-263");
    expect(r.saidasIntrabar).toEqual({ stop: 1, alvo: 0, ambiguos: 0 });
  });

  it("sinal no penúltimo candle entra no último e zera nele; sinal no último candle não abre", () => {
    const entraNoUltimo = pregao(DIA, "10:00", [
      parada(130_000),
      { o: 130_000, h: 130_130, l: 129_990, c: 130_120 }, // decide comprar
      { o: 130_125, h: 130_300, l: 130_100, c: 130_250 }, // último: entra na abertura e zera no fechamento
    ]);
    const a = rodar(entraNoUltimo);
    expect(a.operacoes).toHaveLength(1);
    expect(a.operacoes[0]).toMatchObject({ motivo: "zeragem" });
    expect(a.operacoes[0]!.entrada.toString()).toBe("130130");
    expect(a.operacoes[0]!.saida.toString()).toBe("130245");

    const sinalNoUltimo = pregao(DIA, "10:00", [
      parada(130_000),
      parada(130_000),
      { o: 130_000, h: 130_130, l: 129_990, c: 130_120 }, // sinal no último: não há abertura seguinte
    ]);
    const b = rodar(sinalNoUltimo);
    expect(b.operacoes).toHaveLength(0);
    expect(b.patrimonioFinal.toString()).toBe("5000");
  });

  it("não atravessa o pregão: a ordem do último candle do dia não vai para o dia seguinte", () => {
    const dia1 = pregao(DIA, "16:50", [
      parada(130_000),
      { o: 130_000, h: 130_130, l: 129_990, c: 130_120 }, // sinal no último candle do dia 1
    ]);
    const dia2 = pregao("2026-10-14", "10:00", [parada(130_300), parada(130_300), parada(130_300)]);
    const r = rodar([...dia1, ...dia2]);
    expect(r.operacoes).toHaveLength(0);
  });

  it("o padrão não muda nada: sem execução, `fechamento` e o resultado de antes são idênticos", () => {
    const candles = pregao(DIA, "10:00", [
      parada(130_000),
      { o: 130_000, h: 130_130, l: 129_990, c: 130_120 },
      { o: 130_125, h: 130_300, l: 130_100, c: 130_250 },
      parada(130_400),
      { o: 130_400, h: 130_650, l: 130_380, c: 130_600 },
    ]);
    const semCampo: EntradaBacktestWin = {
      simbolo: "WIN-IBOV",
      candles,
      estrategia: compra,
      modelo,
      limites: null,
      saldoInicial: dec(5000),
    };
    const antes = rodarBacktestWin(semCampo);
    const explicito = rodarBacktestWin({ ...semCampo, execucao: "fechamento" });
    expect(explicito).toEqual(antes);
    // a conta de antes: entrada no fechamento 130.120 + 1 tick
    expect(antes.operacoes[0]!.entrada.toString()).toBe("130125");
    expect(antes.resultadoLiquido.toString()).toBe("187");
  });
});
