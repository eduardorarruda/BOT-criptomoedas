import { dec, precoAlvo } from "@zentrade/dominio";
import { describe, expect, it } from "vitest";
import { OPERACAO_DONCHIAN, pedidoExemplo, velasDeTeste } from "../teste/pedido.js";
import { custoIdaEVolta } from "./custos.js";
import { leituraDoMercado } from "./mercado.js";
import { ALVO_DISTANTE_MULTIPLO, leituraDasSaidas } from "./saidas.js";

const WIN = {
  mercado: "win",
  tarifaPorContrato: "0.25",
  corretagemPorContrato: "0",
  deslizamentoTicks: 1,
} as const;

describe("custo de ida e volta (calculado no código)", () => {
  it("cripto: as duas taxas reais da estratégia mais deslizamento e meio spread nas duas pontas", () => {
    const c = custoIdaEVolta(OPERACAO_DONCHIAN.custos, dec("60450"));
    // (1,001 / 0,999 − 1) + 2 × (5 + 2) pb = 0,2002% + 0,14%
    expect(c.fracao).toBeCloseTo(0.003402, 6);
    expect(c.emPreco.toNumber()).toBeCloseTo(205.65, 1);
    expect(c.texto).toMatch(/0,1% por lado/);
    expect(c.texto).toMatch(/5 pb de deslizamento \+ 2 pb de meio spread/);
  });

  it("WIN: tarifa e corretagem por contrato nas duas pontas mais 1 tick por perna, em reais e pontos", () => {
    const c = custoIdaEVolta(WIN, dec("130000"));
    // 2 × R$ 0,25 + 2 × 1 tick × 5 pontos × R$ 0,20 = R$ 2,50 = 12,5 pontos
    expect(c.emPreco.toNumber()).toBe(12.5);
    expect(c.fracao).toBeCloseTo(12.5 / 130000, 10);
    expect(c.texto).toMatch(/R\$ 2,50 por contrato/);
    expect(c.texto).toMatch(/12,5 pontos/);
  });
});

describe("como a operação sai", () => {
  it("stop em % do preço, em custos de ida e volta e em ATR", () => {
    const pedido = pedidoExemplo({ operacao: OPERACAO_DONCHIAN });
    const custo = custoIdaEVolta(OPERACAO_DONCHIAN.custos, pedido.preco);
    const s = leituraDasSaidas(pedido, custo, 550);
    // 60.450 − 58.800 = 1.650 = 2,73%; ÷ 0,3402% = 8,0 custos; ÷ 550 = 3 ATR
    expect(s.stopEmCustos).toBeCloseTo(8.02, 1);
    expect(s.stopEmAtr).toBeCloseTo(3, 5);
    expect(s.linhas.join("\n")).toMatch(
      /Stop inicial: 58\.800 \(−2,73%; 8 custos de ida e volta; 3 ATR\(14\)\)/,
    );
  });

  it("alvo distante (≥ 5× a distância do stop): avisa que quem encerra é a regra, o stop ou o tempo", () => {
    const alvo = precoAlvo(dec("60450"), 0.6, 0.001);
    const pedido = pedidoExemplo({
      operacao: { ...OPERACAO_DONCHIAN, tempoMaximo: 48 },
      sinal: { acao: "COMPRAR", stop: dec("58800"), alvo, explicacao: "rompeu" },
    });
    const s = leituraDasSaidas(pedido, custoIdaEVolta(OPERACAO_DONCHIAN.custos, pedido.preco), null);
    expect(ALVO_DISTANTE_MULTIPLO).toBe(5);
    expect(s.alvoDistante).toBe(true);
    const texto = s.linhas.join("\n");
    expect(texto).toMatch(/Alvo fixo: .*\+60,\d+%.*DISTANTE DE PROPÓSITO/);
    expect(texto).toMatch(/quem encerra é a regra de saída, o stop ou o tempo/);
    expect(texto).toMatch(/Regra de saída: preço < fundo de Donchian\(10\)/);
    expect(texto).toMatch(/Stop por ATR: 2 × ATR\(20\), no máximo 10%/);
    expect(texto).toMatch(/Tempo máximo: 48 velas \(2 dias\)/);
  });

  it("cofre (tamanho por alocação): stop e alvo largos são proteção contra desastre, não plano de risco", () => {
    const operacao = {
      ...OPERACAO_DONCHIAN,
      stopPercentual: 0.49,
      alvoLiquido: 0.99,
      tamanhoPorVolatilidade: undefined,
      tamanhoPorAlocacao: { fracao: 1 },
    };
    const alvo = precoAlvo(dec("60450"), 0.99, 0.001);
    const pedido = pedidoExemplo({
      operacao,
      sinal: { acao: "COMPRAR", stop: dec("30825"), alvo, explicacao: "acima da SMA 400" },
    });
    const s = leituraDasSaidas(pedido, custoIdaEVolta(operacao.custos, pedido.preco), null);
    expect(s.alvoDistante).toBe(true);
    const texto = s.linhas.join("\n");
    expect(texto).toMatch(/Tamanho por alocação: 100% da exposição máxima/);
    expect(texto).toMatch(/proteção contra desastre/);
    expect(texto).toMatch(/DISTANTE DE PROPÓSITO/);
  });

  it("alvo perto do stop não é chamado de distante", () => {
    const pedido = pedidoExemplo({ operacao: OPERACAO_DONCHIAN });
    const s = leituraDasSaidas(pedido, custoIdaEVolta(OPERACAO_DONCHIAN.custos, pedido.preco), null);
    expect(s.alvoDistante).toBe(false);
    expect(s.linhas.join("\n")).not.toMatch(/DISTANTE/);
  });

  it("stop móvel e empate entram no texto", () => {
    const pedido = pedidoExemplo({
      operacao: {
        ...OPERACAO_DONCHIAN,
        stopMovel: { tipo: "atr", periodo: 14, multiplo: 3 },
        empate: { gatilho: 0.02 },
      },
    });
    const texto = leituraDasSaidas(
      pedido,
      custoIdaEVolta(OPERACAO_DONCHIAN.custos, pedido.preco),
      null,
    ).linhas.join("\n");
    expect(texto).toMatch(/Stop móvel: 3 × ATR\(14\) do melhor preço desde a entrada/);
    expect(texto).toMatch(/Empate: depois de \+2%, o stop vai para o preço de empate/);
  });

  it("saída (venda da posição aberta): resultado se sair agora, líquido dos custos", () => {
    const pedido = pedidoExemplo({
      operacao: OPERACAO_DONCHIAN,
      sinal: { acao: "VENDER", motivo: "regra de saída", explicacao: "fechou abaixo do canal" },
      posicao: {
        quantidade: dec("0.01"),
        precoMedio: dec("60000"),
        resultadoRealizado: dec(0),
        taxasPagas: dec("0.6"),
      },
    });
    const texto = leituraDasSaidas(
      pedido,
      custoIdaEVolta(OPERACAO_DONCHIAN.custos, pedido.preco),
      null,
    ).linhas.join("\n");
    // (60.450 / 60.000 − 1) = +0,75% bruto; − 0,34% = +0,41% líquido
    expect(texto).toMatch(/Posição aberta a 60\.000: \+0,75% bruto, ≈ \+0,41% líquido se sair agora/);
  });

  it("sem a operação no pedido (motor antigo), diz que não sabe como sai", () => {
    const s = leituraDasSaidas(pedidoExemplo(), null, null);
    expect(s.linhas.join("\n")).toMatch(/não informou/);
  });
});

describe("mercado (calculado no código a partir das velas)", () => {
  const inicio = Date.UTC(2026, 9, 16, 0, 0);

  it("ATR atual, regime (percentil e média), faixa recente e volume relativo", () => {
    const { fechamentos, velas } = velasDeTeste({
      quantidade: 300,
      base: 60000,
      amplitude: 30,
      inicio,
      volumeFinal: 250,
    });
    const pedido = pedidoExemplo({
      robo: { id: "r", simbolo: "BTCUSDT", intervalo: "5m" },
      preco: dec(fechamentos.at(-1)!),
      fechamentos,
      velas,
    });
    const m = leituraDoMercado(pedido, inicio + 300 * 300_000);
    expect(m.atr).not.toBeNull();
    const texto = m.linhas.join("\n");
    expect(texto).toMatch(/ATR\(14\): [\d.,]+ \([\d,]+% do preço\); percentil \d+ das últimas \d+ velas/);
    expect(texto).toMatch(/Faixa das últimas 48 velas \(4 h\): /);
    expect(texto).toMatch(/Faixa das últimas 288 velas \(24 h\): /);
    expect(texto).toMatch(/Volume da última vela: 2,5 × a média de 20/);
  });

  it("tempo gráfico maior: 1 h com leitura; 4 h sem velas suficientes diz isso, sem inventar", () => {
    const { fechamentos, velas } = velasDeTeste({ quantidade: 300, base: 60000, amplitude: 30, inicio });
    const pedido = pedidoExemplo({
      robo: { id: "r", simbolo: "BTCUSDT", intervalo: "5m" },
      preco: dec(fechamentos.at(-1)!),
      fechamentos,
      velas,
    });
    const texto = leituraDoMercado(pedido, inicio).linhas.join("\n");
    expect(texto).toMatch(/1h \(25 velas\): EMA\(9\) (subindo|caindo|de lado)/);
    expect(texto).toMatch(/preço [\d,]+% (acima|abaixo) da EMA\(9\)/);
    expect(texto).toMatch(/4h: só 6 velas no histórico \(precisa de 12\)/);
  });

  it("só com fechamentos (sem velas): avisa que ATR, faixa e volume não vieram", () => {
    const texto = leituraDoMercado(pedidoExemplo(), 0).linhas.join("\n");
    expect(texto).toMatch(/sem máximas, mínimas e volumes/);
  });

  it("WIN: fase do pregão no horário de Brasília e distância do VWAP do dia", () => {
    // Véspera 17:00–18:15 (16 velas) e o dia de hoje das 09:00 às 12:15 (40 velas), em BRT (UTC−3).
    const vespera = velasDeTeste({
      quantidade: 16,
      base: 130000,
      amplitude: 50,
      inicio: Date.UTC(2026, 9, 15, 20, 0),
    });
    const hoje = velasDeTeste({
      quantidade: 40,
      base: 130500,
      amplitude: 50,
      inicio: Date.UTC(2026, 9, 16, 12, 0),
    });
    const juntar = <T>(a: readonly T[], b: readonly T[]) => [...a, ...b];
    const pedido = pedidoExemplo({
      robo: { id: "r", simbolo: "WINZ26", intervalo: "5m" },
      preco: dec(hoje.fechamentos.at(-1)!),
      fechamentos: juntar(vespera.fechamentos, hoje.fechamentos),
      velas: {
        instantes: juntar(vespera.velas.instantes, hoje.velas.instantes),
        maximas: juntar(vespera.velas.maximas, hoje.velas.maximas),
        minimas: juntar(vespera.velas.minimas, hoje.velas.minimas),
        volumes: juntar(vespera.velas.volumes, hoje.velas.volumes),
      },
      operacao: { ...OPERACAO_DONCHIAN, custos: WIN },
    });
    const texto = leituraDoMercado(pedido, Date.UTC(2026, 9, 16, 15, 20)).linhas.join("\n");
    expect(texto).toMatch(/Pregão da B3: 12:20 de Brasília, almoço/);
    expect(texto).toMatch(/VWAP do dia: [\d.,]+; preço [\d.,]+ pontos \([\d,]+%\) (acima|abaixo)/);
  });
});
