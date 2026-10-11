import type { BacktestParaRodar } from "@zentrade/banco";
import { PapelCorretora } from "@zentrade/corretora";
import { dec } from "@zentrade/dominio";
import { describe, expect, it } from "vitest";
import { registroDeTeste } from "../teste/cenario.js";
import { serie } from "../teste/candles.js";
import { processarBacktest, reduzirCurva, type RepositorioBacktestsDoMotor } from "./servico.js";

const H = 3_600_000;
const INICIO = Date.UTC(2026, 0, 10);

/** Cai abaixo de 95 (compra) e depois sobe acima do alvo (vende): uma ida e volta com lucro. */
const PRECOS = [...Array<number>(30).fill(100), 94, 94, 96, 97, 98, ...Array<number>(20).fill(98)];

const pedido = (extra: Partial<BacktestParaRodar> = {}): BacktestParaRodar => ({
  id: "b1",
  estrategiaId: "e1",
  versao: 1,
  simbolo: "BTCUSDT",
  intervalo: "1h",
  inicio: INICIO + 20 * H,
  fim: INICIO + PRECOS.length * H,
  estado: "rodando",
  metricas: null,
  curva: null,
  erro: null,
  criadoEm: 0,
  concluidoEm: null,
  estrategia: {
    entrada: {
      tipo: "comparar",
      esquerda: { tipo: "preco" },
      comparador: "<",
      direita: { tipo: "numero", valor: 95 },
    },
    stop: 0.02,
    alvoLiquido: 0.01,
    taxa: 0.001,
  },
  ...extra,
});

function montar(p: BacktestParaRodar | null) {
  const papel = new PapelCorretora({ saldos: {}, taxa: 0, deslizamentoBps: 0 });
  serie(INICIO, PRECOS, H).forEach((c) => papel.alimentar("BTCUSDT", "1h", c));
  const gravado: { concluido?: { metricas: unknown; curva: unknown }; falhou?: string } = {};
  const backtests: RepositorioBacktestsDoMotor = {
    paraRodar: async () => p,
    concluir: async (_id, r) => void (gravado.concluido = r),
    falhar: async (_id, erro) => void (gravado.falhou = erro),
  };
  const { registro, erros } = registroDeTeste();
  const deps = { backtests, fontes: { corretora: papel }, registro };
  const opcoes = { saldoInicial: dec(1000), riscoPorOperacao: 0.01 };
  return { deps, opcoes, gravado, erros };
}

describe("job de backtest", () => {
  it("roda o backtest do pedido e grava as métricas com nomes estáveis e a curva", async () => {
    const m = montar(pedido());
    expect(await processarBacktest(m.deps, m.opcoes, "b1")).toBe("concluido");
    const metricas = m.gravado.concluido?.metricas as Record<string, unknown>;
    expect(Object.keys(metricas).sort()).toEqual(
      [
        "acertos",
        "candles",
        "maiorQueda",
        "maiorQuedaPercentual",
        "operacoes",
        "ordens",
        "patrimonioFinal",
        "resultadoLiquido",
        "resultadoPercentual",
        "riscoPorOperacao",
        "saldoInicial",
        "taxaAcerto",
        "taxasPagas",
      ].sort(),
    );
    expect(metricas).toMatchObject({
      operacoes: 1,
      acertos: 1,
      taxaAcerto: 1,
      ordens: 2,
      saldoInicial: "1000",
    });
    expect(metricas.riscoPorOperacao).toBe("10");
    expect(typeof metricas.resultadoLiquido).toBe("string");
    expect(dec(metricas.resultadoLiquido as string).gt(0)).toBe(true);
    expect(typeof metricas.maiorQuedaPercentual).toBe("number");
    const curva = m.gravado.concluido?.curva as { em: number; patrimonio: string }[];
    expect(curva[0]).toEqual({ em: INICIO + 21 * H - 1, patrimonio: "1000" });
    expect(curva.at(-1)?.patrimonio).toBe(metricas.patrimonioFinal);
  });

  it("pedido que já terminou (ou não existe): nada a fazer", async () => {
    const m = montar(null);
    expect(await processarBacktest(m.deps, m.opcoes, "b1")).toBe("ignorado");
    expect(m.gravado).toEqual({});
  });

  it("erro do backtest (sem candles na janela) é gravado como falhou, com a mensagem", async () => {
    const m = montar(pedido({ inicio: INICIO + 1000 * H, fim: INICIO + 1010 * H }));
    expect(await processarBacktest(m.deps, m.opcoes, "b1")).toBe("falhou");
    expect(m.gravado.falhou).toMatch(/nenhum candle/);
    expect(m.erros.some((e) => /backtest falhou/.test(e.msg))).toBe(true);
  });

  it("curva longa é reduzida mantendo o primeiro e o último ponto", () => {
    const curva = Array.from({ length: 5000 }, (_, i) => ({ em: i, patrimonio: dec(i) }));
    const r = reduzirCurva(curva, 1000);
    expect(r).toHaveLength(1000);
    expect(r[0]?.em).toBe(0);
    expect(r.at(-1)?.em).toBe(4999);
    expect(reduzirCurva(curva.slice(0, 10), 1000)).toHaveLength(10);
  });
});
