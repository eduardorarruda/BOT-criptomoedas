import { describe, expect, it } from "vitest";
import { dec } from "./dinheiro.js";
import { avaliarRisco, type EstadoRisco, type LimitesRisco } from "./risco.js";
import {
  barreirasDaConta,
  contaIndisponivel,
  fimDaSequencia,
  formatarDuracao,
  LIMITES_CONTA_LIVRES,
  perdaDoDiaConta,
  quedaDoPico,
  type EstadoConta,
  type LimitesConta,
} from "./risco-conta.js";

const HORA = 3_600_000;
const AGORA = 1_000 * HORA;

const livres: LimitesConta = LIMITES_CONTA_LIVRES;
const estado: EstadoConta = {
  limites: livres,
  agora: AGORA,
  realizadoDoDia: dec(0),
  naoRealizado: dec(0),
  exposicao: dec(0),
  posicoesAbertas: 0,
  roboTemPosicao: false,
  resultados: [],
  saidasComPerdaConta: [],
  saidasComPerdaRobo: [],
  liberadaEm: null,
  divergencias: [],
};
const compra = { quantidade: dec("0.01"), precoReferencia: dec(60_000) }; // US$ 600

const codigos = (e: EstadoConta, p = compra) => barreirasDaConta(p, e).map((b) => b.codigo);
const com = (limites: Partial<LimitesConta>, resto: Partial<EstadoConta> = {}): EstadoConta => ({
  ...estado,
  ...resto,
  limites: { ...livres, ...limites },
});

describe("limites da conta", () => {
  it("sem limite configurado nada barra", () => {
    const tudoRuim = {
      ...estado,
      realizadoDoDia: dec(-10_000),
      exposicao: dec(1_000_000),
      posicoesAbertas: 50,
      saidasComPerdaConta: [AGORA - 1, AGORA - 2, AGORA - 3],
    };
    expect(barreirasDaConta(compra, tudoRuim)).toEqual([]);
  });

  describe("perda do dia da conta", () => {
    it("barra quando o realizado do dia chega ao limite", () => {
      expect(codigos(com({ perdaDiariaMaxima: dec(100) }, { realizadoDoDia: dec(-100) }))).toEqual([
        "conta_perda_diaria",
      ]);
      expect(codigos(com({ perdaDiariaMaxima: dec(100) }, { realizadoDoDia: dec("-99.99") }))).toEqual([]);
    });

    it("soma o não realizado só quando configurado", () => {
      const e = { realizadoDoDia: dec(-60), naoRealizado: dec(-50) };
      expect(codigos(com({ perdaDiariaMaxima: dec(100) }, e))).toEqual([]);
      expect(codigos(com({ perdaDiariaMaxima: dec(100), incluirNaoRealizado: true }, e))).toEqual([
        "conta_perda_diaria",
      ]);
      expect(perdaDoDiaConta(com({ incluirNaoRealizado: true }, e)).toFixed()).toBe("-110");
      expect(perdaDoDiaConta(com({}, e)).toFixed()).toBe("-60");
    });

    it("o não realizado entra com sinal: ganho aberto compensa perda realizada", () => {
      const e = com(
        { perdaDiariaMaxima: dec(100), incluirNaoRealizado: true },
        { realizadoDoDia: dec(-120), naoRealizado: dec(30) },
      );
      expect(codigos(e)).toEqual([]);
      expect(barreirasDaConta(compra, { ...e, naoRealizado: dec(10) })[0]?.mensagem).toContain("US$ 110,00");
    });
  });

  it("exposição: soma a da conta com a desta compra", () => {
    const limite = { exposicaoMaxima: dec(1_000) };
    expect(codigos(com(limite, { exposicao: dec(400) }))).toEqual([]);
    expect(codigos(com(limite, { exposicao: dec(401) }))).toEqual(["conta_exposicao"]);
    expect(barreirasDaConta(compra, com(limite, { exposicao: dec(401) }))[0]?.mensagem).toContain(
      "US$ 1.001,00",
    );
  });

  it("posições abertas: barra só a compra que abriria mais uma", () => {
    const limite = { posicoesAbertasMax: 2 };
    expect(codigos(com(limite, { posicoesAbertas: 1 }))).toEqual([]);
    expect(codigos(com(limite, { posicoesAbertas: 2 }))).toEqual(["conta_posicoes"]);
    expect(codigos(com(limite, { posicoesAbertas: 2, roboTemPosicao: true }))).toEqual([]);
  });

  it("divergência aberta com a corretora barra compras do robô", () => {
    const e = com({}, { divergencias: [{ ativo: "BTC", falta: dec("0.002"), detectadaEm: AGORA - HORA }] });
    const [b] = barreirasDaConta(compra, e);
    expect(b?.codigo).toBe("divergencia_saldo");
    expect(b?.mensagem).toContain("BTC");
  });

  it("estado da conta indisponível barra a compra com o motivo", () => {
    const e = contaIndisponivel(AGORA, "banco fora do ar");
    expect(codigos(e)).toEqual(["conta_indisponivel"]);
    expect(barreirasDaConta(compra, e)[0]?.mensagem).toContain("banco fora do ar");
  });
});

describe("queda do pico (drawdown)", () => {
  const pontos = [
    { em: AGORA - 10 * HORA, delta: dec(100) },
    { em: AGORA - 8 * HORA, delta: dec(50) }, // pico 150
    { em: AGORA - 5 * HORA, delta: dec(-120) }, // 30
    { em: AGORA - 2 * HORA, delta: dec(20) }, // 50
  ];

  it("acompanha o pico e mede a distância até o resultado atual", () => {
    const q = quedaDoPico(pontos, AGORA - 24 * HORA, dec(0));
    expect(q.pico.toFixed()).toBe("150");
    expect(q.atual.toFixed()).toBe("50");
    expect(q.queda.toFixed()).toBe("100");
    expect(q.picoEm).toBe(AGORA - 8 * HORA);
  });

  it("o não realizado entra só no ponto atual", () => {
    expect(quedaDoPico(pontos, AGORA - 24 * HORA, dec(-30)).queda.toFixed()).toBe("130");
    expect(quedaDoPico(pontos, AGORA - 24 * HORA, dec(200)).queda.toFixed()).toBe("0");
  });

  it("só conta o que está dentro da janela, partindo de zero", () => {
    const q = quedaDoPico(pontos, AGORA - 6 * HORA, dec(0));
    expect(q.pico.toFixed()).toBe("0");
    expect(q.picoEm).toBeNull();
    expect(q.queda.toFixed()).toBe("100");
  });

  it("sem pontos não há queda", () => {
    expect(quedaDoPico([], 0, dec(0)).queda.toFixed()).toBe("0");
  });

  it("barra a compra quando a queda passa do limite e diz quando libera", () => {
    const limites = { quedaMaxima: dec(80), quedaJanelaMs: 24 * HORA };
    const e = com(limites, { resultados: pontos });
    const [b] = barreirasDaConta(compra, e);
    expect(b?.codigo).toBe("conta_queda");
    expect(b?.mensagem).toContain("US$ 100,00");
    expect(b?.mensagem).toContain("16 h");
  });

  it("liberação manual zera o pico: só conta o que veio depois", () => {
    const limites = { quedaMaxima: dec(80), quedaJanelaMs: 24 * HORA };
    expect(codigos(com(limites, { resultados: pontos, liberadaEm: AGORA - 3 * HORA }))).toEqual([]);
  });

  it("pico fora da janela deixa de contar", () => {
    const limites = { quedaMaxima: dec(80), quedaJanelaMs: 7 * HORA };
    expect(codigos(com(limites, { resultados: pontos }))).toEqual(["conta_queda"]);
    const limitesCurtos = { quedaMaxima: dec(80), quedaJanelaMs: 4 * HORA };
    expect(codigos(com(limitesCurtos, { resultados: pontos }))).toEqual([]);
  });
});

describe("sequência de stops (StoplossGuard)", () => {
  const perdas = [AGORA - 5 * HORA, AGORA - 3 * HORA, AGORA - HORA];

  it("pausa quando N saídas com perda cabem na janela e diz quando libera", () => {
    expect(fimDaSequencia(perdas, 3, 6 * HORA, AGORA, null)).toBe(AGORA + HORA);
    expect(fimDaSequencia(perdas, 2, 6 * HORA, AGORA, null)).toBe(AGORA + 3 * HORA);
  });

  it("não pausa abaixo de N ou com perdas fora da janela", () => {
    expect(fimDaSequencia(perdas, 4, 6 * HORA, AGORA, null)).toBeNull();
    expect(fimDaSequencia(perdas, 3, 4 * HORA, AGORA, null)).toBeNull();
    expect(fimDaSequencia([], 1, HORA, AGORA, null)).toBeNull();
  });

  it("perdas antes da liberação manual não contam", () => {
    expect(fimDaSequencia(perdas, 3, 6 * HORA, AGORA, AGORA - 4 * HORA)).toBeNull();
  });

  it("perdas fora de ordem são ordenadas", () => {
    expect(fimDaSequencia([AGORA - HORA, AGORA - 5 * HORA, AGORA - 3 * HORA], 3, 6 * HORA, AGORA, null)).toBe(
      AGORA + HORA,
    );
  });

  const limites = { sequenciaStopsMax: 3, sequenciaStopsJanelaMs: 6 * HORA };

  it("escopo conta usa as perdas de todos os robôs", () => {
    const e = com({ ...limites, sequenciaStopsEscopo: "conta" }, { saidasComPerdaConta: perdas });
    expect(codigos(e)).toEqual(["sequencia_stops"]);
    expect(codigos({ ...e, saidasComPerdaConta: [], saidasComPerdaRobo: perdas })).toEqual([]);
  });

  it("escopo robô usa só as perdas deste robô", () => {
    const e = com({ ...limites, sequenciaStopsEscopo: "robo" }, { saidasComPerdaRobo: perdas });
    expect(codigos(e)).toEqual(["sequencia_stops_robo"]);
    expect(codigos({ ...e, saidasComPerdaRobo: [], saidasComPerdaConta: perdas })).toEqual([]);
  });

  it("escopo ambos confere os dois", () => {
    const e = com(
      { ...limites, sequenciaStopsEscopo: "ambos" },
      { saidasComPerdaConta: perdas, saidasComPerdaRobo: perdas },
    );
    expect(codigos(e)).toEqual(["sequencia_stops", "sequencia_stops_robo"]);
    const [b] = barreirasDaConta(compra, e);
    expect(b?.mensagem).toContain("3 saídas com perda");
    expect(b?.mensagem).toContain("1 h");
  });
});

describe("no motor de risco (avaliarRisco)", () => {
  const limitesRobo: LimitesRisco = {
    perdaDiariaMaxima: dec(1_000),
    exposicaoMaxima: dec(100_000),
    ordensPorHoraMax: 100,
    pausaAposPerdaMs: 0,
    confiancaMinima: 0,
  };
  const filtros = {
    passoQuantidade: dec("0.00001"),
    quantidadeMinima: dec("0.00001"),
    valorMinimo: dec(5),
    passoPreco: dec("0.01"),
  };
  const tudoEstourado = com(
    {
      perdaDiariaMaxima: dec(10),
      exposicaoMaxima: dec(10),
      posicoesAbertasMax: 0,
      quedaMaxima: dec(1),
      sequenciaStopsMax: 1,
    },
    {
      realizadoDoDia: dec(-500),
      exposicao: dec(500),
      posicoesAbertas: 3,
      resultados: [{ em: AGORA - HORA, delta: dec(-50) }],
      saidasComPerdaConta: [AGORA - HORA],
      saidasComPerdaRobo: [AGORA - HORA],
      divergencias: [{ ativo: "BTC", falta: dec(1), detectadaEm: AGORA }],
    },
  );
  const base: EstadoRisco = {
    pausado: false,
    resultadoDoDia: dec(0),
    exposicaoAtual: dec(0),
    ordensUltimaHora: 0,
    ultimaPerdaEm: null,
    agora: AGORA,
    conta: tudoEstourado,
  };
  const ordem = { quantidade: dec("0.01"), precoReferencia: dec(60_000), confianca: 1 };

  it("barra a compra com cada limite da conta estourado", () => {
    const r = avaliarRisco(
      { ...ordem, lado: "COMPRA", stop: dec(59_000), alvo: dec(62_000) },
      base,
      limitesRobo,
      filtros,
      0.001,
    );
    expect(r.aprovada ? [] : r.barreiras.map((b) => b.codigo)).toEqual([
      "conta_perda_diaria",
      "conta_exposicao",
      "conta_posicoes",
      "conta_queda",
      "sequencia_stops",
      "sequencia_stops_robo",
      "divergencia_saldo",
    ]);
  });

  it("nunca barra a venda, nem com tudo estourado nem com a conta indisponível", () => {
    const venda = { ...ordem, lado: "VENDA" as const };
    expect(avaliarRisco(venda, base, limitesRobo, filtros, 0.001)).toEqual({ aprovada: true });
    const indisponivel = { ...base, conta: contaIndisponivel(AGORA, "falhou") };
    expect(avaliarRisco(venda, indisponivel, limitesRobo, filtros, 0.001)).toEqual({ aprovada: true });
  });

  it("sem estado da conta, só os limites do robô valem", () => {
    const { conta: _sem, ...semConta } = base;
    expect(
      avaliarRisco(
        { ...ordem, lado: "COMPRA", stop: dec(59_000), alvo: dec(62_000) },
        semConta,
        limitesRobo,
        filtros,
        0.001,
      ),
    ).toEqual({ aprovada: true });
  });
});

describe("formatarDuracao", () => {
  it("escreve minutos, horas e horas com minutos", () => {
    expect(formatarDuracao(30_000)).toBe("1 min");
    expect(formatarDuracao(45 * 60_000)).toBe("45 min");
    expect(formatarDuracao(HORA)).toBe("1 h");
    expect(formatarDuracao(90 * 60_000)).toBe("1 h 30 min");
  });
});
