import type { BacktestParaRodar, ResultadoBacktestGravado } from "@zentrade/banco";
import {
  ConfiguracaoBacktestEsquema,
  MetricasBacktestEsquema,
  ValidacaoBacktestEsquema,
} from "@zentrade/contratos";
import { PapelCorretora } from "@zentrade/corretora";
import { dec } from "@zentrade/dominio";
import { describe, expect, it } from "vitest";
import { registroDeTeste } from "../teste/cenario.js";
import { serie } from "../teste/candles.js";
import {
  limitesDoBacktest,
  processarBacktest,
  reduzirCurva,
  type RepositorioBacktestsDoMotor,
} from "./servico.js";

const H = 3_600_000;
const INICIO = Date.UTC(2026, 0, 10);

/** Cai abaixo de 95 (compra) e depois sobe acima do alvo (vende): uma ida e volta com lucro. */
const PRECOS = [...Array<number>(30).fill(100), 94, 94, 96, 97, 98, ...Array<number>(20).fill(98)];

const pedido = (extra: Partial<BacktestParaRodar> = {}): BacktestParaRodar => ({
  id: "b1",
  usuarioId: "u1",
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
  configuracao: null,
  validacao: null,
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
  const gravado: { concluido?: ResultadoBacktestGravado; falhou?: string } = {};
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
    const ESTAVEIS = [
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
    ];
    expect(Object.keys(metricas)).toEqual(expect.arrayContaining(ESTAVEIS));
    expect(metricas).toMatchObject({
      operacoes: 1,
      acertos: 1,
      taxaAcerto: 1,
      ordens: 2,
      saldoInicial: "1000",
    });
    // Padrão: os limites de um robô novo (risco por operação = 0,5% do saldo).
    expect(metricas.riscoPorOperacao).toBe("5");
    expect(typeof metricas.resultadoLiquido).toBe("string");
    expect(dec(metricas.resultadoLiquido as string).gt(0)).toBe(true);
    expect(typeof metricas.maiorQuedaPercentual).toBe("number");
    const curva = m.gravado.concluido?.curva as { em: number; patrimonio: string; buyHold?: string }[];
    expect(curva[0]).toMatchObject({ em: INICIO + 21 * H - 1, patrimonio: "1000" });
    expect(curva.at(-1)?.patrimonio).toBe(metricas.patrimonioFinal);
    expect(curva.every((p) => typeof p.buyHold === "string")).toBe(true);
  });

  it("custos padrão em toda execução, buy and hold, risco e validação gravados no contrato", async () => {
    const m = montar(pedido());
    await processarBacktest(m.deps, m.opcoes, "b1");
    const metricas = m.gravado.concluido?.metricas as Record<string, unknown>;
    expect(dec(metricas.deslizamentoPago as string).gt(0)).toBe(true);
    // Bruto = líquido + taxas + deslizamento.
    expect(dec(metricas.resultadoBruto as string).toFixed()).toBe(
      dec(metricas.resultadoLiquido as string)
        .plus(metricas.taxasPagas as string)
        .plus(metricas.deslizamentoPago as string)
        .toFixed(),
    );
    expect(metricas).toMatchObject({
      barrasPorAno: 8760,
      precisaoMinuto: false,
      stopsIntrabar: 0,
      alvosIntrabar: expect.any(Number),
    });
    expect(typeof metricas.buyHoldResultadoPercentual).toBe("number");
    expect(typeof metricas.sharpe).toBe("number");
    // O que o motor grava passa no contrato que a API e a tela leem.
    expect(MetricasBacktestEsquema.safeParse(metricas).error).toBeUndefined();
    const validacao = ValidacaoBacktestEsquema.parse(m.gravado.concluido?.validacao);
    expect(validacao.amostra?.fracaoDentro).toBe(0.7);
    expect(validacao.walkForward?.janelas).toHaveLength(5);
    expect(validacao.monteCarlo).toBeNull();
    expect(validacao.avisos.map((a) => a.codigo)).toEqual(
      expect.arrayContaining(["poucas_operacoes", "periodo_curto"]),
    );
  });

  it("sem limites e saldo próprio: risco do ambiente sobre o saldo pedido, com aviso", async () => {
    const configuracao = ConfiguracaoBacktestEsquema.parse({
      saldoInicial: "2000",
      risco: { modo: "sem_limites" },
    });
    const m = montar(pedido({ configuracao }));
    await processarBacktest(m.deps, m.opcoes, "b1");
    const metricas = m.gravado.concluido?.metricas as Record<string, unknown>;
    expect(metricas).toMatchObject({ saldoInicial: "2000", riscoPorOperacao: "20" });
    const validacao = ValidacaoBacktestEsquema.parse(m.gravado.concluido?.validacao);
    expect(validacao.avisos.map((a) => a.codigo)).toContain("sem_limites");
  });

  it("precisão de 1 minuto pede os candles de 1 minuto da janela à fonte", async () => {
    const m = montar(pedido({ configuracao: ConfiguracaoBacktestEsquema.parse({ precisaoMinuto: true }) }));
    const pedidos: string[] = [];
    const corretora = m.deps.fontes.corretora;
    const fontes = {
      corretora: {
        candles: (...a: Parameters<typeof corretora.candles>) => {
          pedidos.push(a[1]);
          return corretora.candles(...a);
        },
      },
    };
    expect(await processarBacktest({ ...m.deps, fontes }, m.opcoes, "b1")).toBe("concluido");
    expect(pedidos).toContain("1m");
    // Sem candles de 1 minuto na fonte, cai no candle do intervalo e diz isso.
    expect((m.gravado.concluido?.metricas as Record<string, unknown>).precisaoMinuto).toBe(false);
  });

  it("indicador longo (SMA 400 do cofre): carrega histórico suficiente e opera já no primeiro candle da janela", async () => {
    const precos = Array.from({ length: 520 }, (_, i) => 100 + i * 0.1);
    const papel = new PapelCorretora({ saldos: {}, taxa: 0, deslizamentoBps: 0 });
    serie(INICIO, precos, H).forEach((c) => papel.alimentar("BTCUSDT", "1h", c));
    let gravado: ResultadoBacktestGravado | undefined;
    const backtests: RepositorioBacktestsDoMotor = {
      paraRodar: async () =>
        pedido({
          inicio: INICIO + 450 * H,
          fim: INICIO + 520 * H,
          estrategia: {
            entrada: {
              tipo: "comparar",
              esquerda: { tipo: "preco" },
              comparador: ">",
              direita: { tipo: "indicador", nome: "sma", periodo: 400 },
            },
            stop: 0.49,
            alvoLiquido: 0.99,
            taxa: 0.001,
            tamanhoPorAlocacao: { fracao: 1 },
          },
        }),
      concluir: async (_id, r) => void (gravado = r),
      falhar: async (_id, erro) => {
        throw new Error(erro);
      },
    };
    const { registro } = registroDeTeste();
    await processarBacktest(
      { backtests, fontes: { corretora: papel }, registro },
      { saldoInicial: dec(1000), riscoPorOperacao: 0.01 },
      "b1",
    );
    // Com só 200 velas de aquecimento a SMA 400 não teria dados e a posição nunca abriria.
    expect((gravado?.metricas as Record<string, number>).tempoExposto).toBeGreaterThan(0.9);
  });

  it("limites do robô informados valem no lugar dos padrões", () => {
    const limites = {
      perdaDiariaMaxima: "7",
      exposicaoMaxima: "70",
      riscoPorOperacao: "2",
      ordensPorHoraMax: 2,
      pausaAposPerdaMin: 30,
      confiancaMinima: 0.5,
    };
    const c = ConfiguracaoBacktestEsquema.parse({ risco: { modo: "robo", limites } });
    const r = limitesDoBacktest(c, dec(1000), 0.01);
    expect(r.riscoPorOperacao.toFixed()).toBe("2");
    expect(r.limites).toMatchObject({
      ordensPorHoraMax: 2,
      pausaAposPerdaMs: 1_800_000,
      confiancaMinima: 0.5,
    });
    expect(r.limites.exposicaoMaxima.toFixed()).toBe("70");
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

describe("job de backtest com filtro de dia de evento", () => {
  // PRECOS começam em 10/01 00:00 UTC, de hora em hora; a compra cai no candle 30 (11/01 06:00 UTC, 03:00 em Brasília)
  const COPOM = { data: "2026-01-11", mercado: "cripto", titulo: "Copom", impacto: "alto" } as const;
  const config = (diasDeEvento: "ignorar" | "bloquear" | "reduzir") =>
    ConfiguracaoBacktestEsquema.parse({ diasDeEvento });

  it("bloquear: lê a agenda da dona do pedido no período e grava as contagens", async () => {
    const m = montar(pedido({ configuracao: config("bloquear") }));
    const pedidos: unknown[][] = [];
    const agenda = {
      listar: async (...args: [string, string, string]) => {
        pedidos.push(args);
        return [COPOM];
      },
    };
    expect(await processarBacktest({ ...m.deps, agenda }, m.opcoes, "b1")).toBe("concluido");
    expect(pedidos).toHaveLength(1);
    expect(pedidos[0]?.[0]).toBe("u1");
    expect(m.gravado.concluido?.metricas).toMatchObject({ operacoes: 0 });
    expect(
      MetricasBacktestEsquema.parse(m.gravado.concluido?.metricas).entradasBarradasPorEvento,
    ).toBeGreaterThan(0);
  });

  it("ignorar (padrão): nem consulta a agenda e as métricas não trazem as contagens", async () => {
    const m = montar(pedido());
    const agenda = {
      listar: async () => {
        throw new Error("não devia consultar");
      },
    };
    expect(await processarBacktest({ ...m.deps, agenda }, m.opcoes, "b1")).toBe("concluido");
    expect(m.gravado.concluido?.metricas).not.toHaveProperty("entradasBarradasPorEvento");
  });

  it("filtro ligado sem agenda disponível: falha dizendo por quê, em vez de rodar sem o filtro", async () => {
    const m = montar(pedido({ configuracao: config("bloquear") }));
    expect(await processarBacktest(m.deps, m.opcoes, "b1")).toBe("falhou");
    expect(m.gravado.falhou).toContain("agenda de eventos");
  });
});
