import type { CandidataAvaliacao, PropostaAgente } from "@zentrade/contratos";
import { dec, type Candle, type Regra } from "@zentrade/dominio";
import { describe, expect, it } from "vitest";
import { avaliarCandidata, OPCOES_PLACAR_PADRAO } from "./avaliar.js";

const HORA = 3_600_000;
const T0 = Date.UTC(2026, 9, 10, 0, 0);
const vela = (i: number, o: number, h: number, l: number, c: number): Candle => ({
  abertura: T0 + i * HORA,
  fechamento: T0 + (i + 1) * HORA - 1,
  abre: dec(o),
  maxima: dec(h),
  minima: dec(l),
  fecha: dec(c),
  volume: dec(1),
});
const parada = (i: number, p: number) => vela(i, p, p, p, p);
const sempre: Regra = {
  tipo: "comparar",
  esquerda: { tipo: "preco" },
  comparador: ">",
  direita: { tipo: "numero", valor: 0 },
};
const proposta = (acao: PropostaAgente["acao"], confianca: number): PropostaAgente => ({
  acao,
  confianca,
  tamanhoRelativo: 1,
  justificativa: "x",
  riscos: [],
  fontes: [],
});

const candidata = (extra: Partial<CandidataAvaliacao> = {}): CandidataAvaliacao => ({
  decisaoId: "d1",
  usuarioId: "u1",
  roboId: "r1",
  simbolo: "BTCUSDT",
  intervalo: "1h",
  em: T0 + HORA - 1,
  preco: dec(100),
  quantidade: null,
  estado: "registrada",
  proposta: proposta("aguardar", 0.7),
  protecao: null,
  resultadoReal: null,
  estrategia: { entrada: sempre, stop: 0.02, alvoLiquido: 0.03, taxa: 0 },
  riscoPorOperacao: dec(10),
  exposicaoMaxima: dec(1000),
  ...extra,
});

const semCusto = { ...OPCOES_PLACAR_PADRAO, bpsContra: 0 };
const AGORA = T0 + 100 * HORA;

describe("avaliar uma decisão do Claude", () => {
  it("veto com o contrafactual no stop: veto certo, tamanho pelo risco do robô (10 ÷ 2 = 5)", () => {
    const a = avaliarCandidata(
      candidata(),
      { antes: [parada(0, 100)], depois: [vela(1, 100, 100.5, 97, 98)] },
      AGORA,
      semCusto,
    );
    expect(a).toMatchObject({
      decisaoId: "d1",
      usuarioId: "u1",
      claude: "vetou",
      confianca: 0.7,
      fonte: "contrafactual",
      situacao: "concluida",
      motivo: "stop",
      barras: 1,
      moeda: "USDT",
      em: AGORA,
    });
    expect(a.quantidade?.toString()).toBe("5");
    expect(a.resultado?.toString()).toBe("-10");
    expect(a.retorno).toBeCloseTo(-0.02, 12);
    expect(a.precoEntrada?.toString()).toBe("100");
    expect(a.precoSaida?.toString()).toBe("98");
  });

  it("aprovação não executada: usa a quantidade e a proteção da decisão", () => {
    const a = avaliarCandidata(
      candidata({
        proposta: proposta("comprar", 0.9),
        quantidade: dec(2),
        protecao: { stop: dec(99), alvo: dec(101) },
      }),
      { antes: [parada(0, 100)], depois: [vela(1, 100, 101.5, 99.5, 101)] },
      AGORA,
      semCusto,
    );
    expect(a).toMatchObject({ claude: "aprovou", situacao: "concluida", motivo: "alvo" });
    expect(a.resultado?.toString()).toBe("2");
  });

  it("aprovação com quantidade zero (barrada pelo tamanho): volta ao tamanho de referência", () => {
    const a = avaliarCandidata(
      candidata({ proposta: proposta("comprar", 0.9), quantidade: dec(0) }),
      { antes: [parada(0, 100)], depois: [vela(1, 100, 100, 97, 98)] },
      AGORA,
      semCusto,
    );
    expect(a.quantidade?.toString()).toBe("5");
  });

  it("sem candles depois: pendente contrafactual", () => {
    const a = avaliarCandidata(candidata(), { antes: [parada(0, 100)], depois: [] }, AGORA, semCusto);
    expect(a).toMatchObject({ situacao: "pendente", fonte: "contrafactual", barras: 0 });
    expect(a.resultado).toBeUndefined();
  });

  it("executada com a posição fechada: o resultado real, não a simulação", () => {
    const a = avaliarCandidata(
      candidata({
        estado: "executada",
        proposta: proposta("comprar", 0.8),
        quantidade: dec("0.5"),
        resultadoReal: dec("1.25"),
      }),
      { antes: [parada(0, 100)], depois: [vela(1, 100, 100, 90, 91)] },
      AGORA,
      semCusto,
    );
    expect(a).toMatchObject({ fonte: "real", situacao: "concluida", claude: "aprovou" });
    expect(a.resultado?.toString()).toBe("1.25");
    expect(a.retorno).toBeCloseTo(0.025, 12);
    expect(a.motivo).toBeUndefined();
  });

  it("executada com a posição ainda aberta: pendente real", () => {
    const a = avaliarCandidata(
      candidata({ estado: "executada", proposta: proposta("comprar", 0.8), quantidade: dec(1) }),
      { antes: [parada(0, 100)], depois: [parada(1, 100)] },
      AGORA,
      semCusto,
    );
    expect(a).toMatchObject({ fonte: "real", situacao: "pendente", barras: 1 });
  });

  it("no mini índice: reais, 1 contrato, custos e sessão da B3", () => {
    const a = avaliarCandidata(
      candidata({
        simbolo: "WIN-IBOV",
        preco: dec(130_000),
        estrategia: { entrada: sempre, stop: 0.005, alvoLiquido: 0.01, taxa: 0 },
      }),
      { antes: [parada(0, 130_000)], depois: [vela(1, 130_000, 131_400, 129_900, 131_350)] },
      AGORA,
      semCusto,
    );
    expect(a).toMatchObject({ moeda: "BRL", situacao: "concluida", motivo: "alvo" });
    expect(a.quantidade?.toString()).toBe("1");
  });

  it("par com outra cotação: a moeda é a cotação do par", () => {
    const a = avaliarCandidata(
      candidata({ simbolo: "ETHBTC" }),
      { antes: [parada(0, 100)], depois: [] },
      AGORA,
      semCusto,
    );
    expect(a.moeda).toBe("BTC");
  });
});
