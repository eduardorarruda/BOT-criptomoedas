import { ConfiguracaoWinEsquema } from "@zentrade/contratos";
import {
  dec,
  type Estrategia,
  type EventoMercado,
  type LimitesRisco,
  type ModoDiasDeEvento,
} from "@zentrade/dominio";
import { describe, expect, it } from "vitest";
import { parada, pregao } from "../../teste/win.js";
import { modeloWinDe } from "./modelo.js";
import { rodarBacktestWin } from "./rodar.js";

const DIAS = ["2026-10-13", "2026-10-14", "2026-10-15"];
const preco = { tipo: "preco" } as const;
const modelo = modeloWinDe(ConfiguracaoWinEsquema.parse({ riscoPorOperacao: "300" }));
const compra: Estrategia = {
  entrada: {
    tipo: "comparar",
    esquerda: preco,
    comparador: "cruzouAcima",
    direita: { tipo: "numero", valor: 130_100 },
  },
  stop: 0.005,
  alvoLiquido: 0.01,
  taxa: 0,
};
const limites: LimitesRisco = {
  perdaDiariaMaxima: dec(100_000),
  exposicaoMaxima: dec(100_000),
  ordensPorHoraMax: 50,
  pausaAposPerdaMs: 0,
  confiancaMinima: 0,
};

/** O mesmo pregão em cada dia: cruza 130.100 e segue até zerar no último candle. */
const velasDoDia = (dia: string) =>
  pregao(dia, "10:00", [
    parada(130_000),
    { o: 130_000, h: 130_130, l: 129_990, c: 130_120 },
    { o: 130_125, h: 130_300, l: 130_100, c: 130_250 },
    parada(130_400),
    { o: 130_400, h: 130_650, l: 130_380, c: 130_600 },
  ]);
const candles = DIAS.flatMap(velasDoDia);

const PAYROLL: EventoMercado = {
  data: "2026-10-14",
  mercado: "win",
  titulo: "Payroll (EUA)",
  impacto: "alto",
};

const rodar = (modo: ModoDiasDeEvento, eventos: readonly EventoMercado[] = [PAYROLL], extra = {}) =>
  rodarBacktestWin({
    simbolo: "WIN-IBOV",
    candles,
    estrategia: compra,
    modelo,
    limites,
    saldoInicial: dec(5000),
    diasDeEvento: modo,
    eventos,
    ...extra,
  });

describe("backtest do mini índice com filtro de dia de evento", () => {
  it("ignorar: três operações, nada contado", () => {
    const r = rodar("ignorar");
    expect(r.operacoes).toHaveLength(3);
    expect(r.entradasBarradasPorEvento).toBe(0);
    expect(r.entradasReduzidasPorEvento).toBe(0);
  });

  it("bloquear: não abre no dia do evento, mantém todas as velas e os outros dias ficam idênticos", () => {
    const base = rodar("ignorar");
    const r = rodar("bloquear");
    expect(r.candles).toHaveLength(candles.length);
    expect(r.curva).toHaveLength(candles.length);
    expect(r.operacoes.map((o) => o.dia)).toEqual(["2026-10-13", "2026-10-15"]);
    expect(r.entradasBarradasPorEvento).toBe(1);
    expect(r.operacoes[0]).toEqual(base.operacoes[0]);
    expect(r.operacoes[1]).toEqual(base.operacoes[2]);
  });

  it("reduzir: no dia do evento entra com metade do risco (1 contrato em vez de 2)", () => {
    const base = rodar("ignorar");
    const r = rodar("reduzir");
    expect(base.operacoes[1]?.contratos).toBe(2);
    expect(r.operacoes.map((o) => o.contratos)).toEqual([2, 1, 2]);
    expect(r.entradasReduzidasPorEvento).toBe(1);
    expect(r.operacoes[0]).toEqual(base.operacoes[0]);
    expect(r.operacoes[2]).toEqual(base.operacoes[2]);
  });

  it("vale também com a execução na abertura do candle seguinte", () => {
    const base = rodar("ignorar", [], { execucao: "proximaAbertura" });
    const r = rodar("bloquear", [PAYROLL], { execucao: "proximaAbertura" });
    expect(r.operacoes.map((o) => o.dia)).toEqual(["2026-10-13", "2026-10-15"]);
    expect(r.operacoes[0]).toEqual(base.operacoes[0]);
    expect(r.entradasBarradasPorEvento).toBe(1);
  });

  it("evento fora da janela de horário do dia não filtra; dentro dela, sim", () => {
    const tarde = { ...PAYROLL, de: "14:00", ate: "15:00" };
    expect(rodar("bloquear", [tarde]).operacoes).toHaveLength(3);
    const manha = { ...PAYROLL, de: "10:00", ate: "10:30" };
    expect(rodar("bloquear", [manha]).operacoes).toHaveLength(2);
  });

  it("evento de cripto ou de impacto médio não filtra o WIN; 'todos' filtra", () => {
    expect(rodar("bloquear", [{ ...PAYROLL, mercado: "cripto" }]).operacoes).toHaveLength(3);
    expect(rodar("bloquear", [{ ...PAYROLL, impacto: "medio" }]).operacoes).toHaveLength(3);
    expect(rodar("bloquear", [{ ...PAYROLL, mercado: "todos" }]).operacoes).toHaveLength(2);
  });

  it("sem limites (limites: null) o filtro de evento ainda vale quando o modo é passado", () => {
    const r = rodarBacktestWin({
      simbolo: "WIN-IBOV",
      candles,
      estrategia: compra,
      modelo,
      limites: null,
      diasDeEvento: "bloquear",
      saldoInicial: dec(5000),
      eventos: [PAYROLL],
    });
    expect(r.operacoes).toHaveLength(2);
  });
});
