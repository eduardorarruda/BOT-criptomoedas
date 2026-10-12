import { describe, expect, it } from "vitest";
import {
  DecisaoEsquema,
  EstrategiaEsquema,
  LimitesRiscoEsquema,
  OrdemEsquema,
  TextoDecimal,
} from "./index.js";
import { EventoEsquema } from "./eventos.js";
import { PropostaAgenteEsquema } from "./proposta.js";
import { RegraEsquema } from "./regra.js";
import { assinar, verificar } from "./webhook.js";

const SEGREDO = "s".repeat(40);

describe("assinatura dos webhooks", () => {
  const agora = 1_760_000_000_000;
  const corpo = JSON.stringify({ decisaoId: "d1", aprovada: true });

  it("aceita a própria assinatura dentro do prazo", () => {
    expect(verificar(corpo, assinar(corpo, SEGREDO, agora), SEGREDO, agora + 60_000)).toBe(true);
  });

  it("recusa corpo alterado, segredo errado, prazo vencido e cabeçalho torto", () => {
    const cab = assinar(corpo, SEGREDO, agora);
    expect(verificar(corpo + " ", cab, SEGREDO, agora)).toBe(false);
    expect(verificar(corpo, cab, "x".repeat(40), agora)).toBe(false);
    expect(verificar(corpo, cab, SEGREDO, agora + 301_000)).toBe(false);
    expect(verificar(corpo, "t=abc,v1=zz", SEGREDO, agora)).toBe(false);
    expect(verificar(corpo, undefined, SEGREDO, agora)).toBe(false);
  });

  it("recusa segredo curto demais", () => {
    expect(() => assinar(corpo, "curto", agora)).toThrow(/32/);
  });
});

describe("esquemas", () => {
  it("decimal só em texto", () => {
    expect(TextoDecimal.safeParse("0.00123").success).toBe(true);
    expect(TextoDecimal.safeParse("1e-5").success).toBe(false);
    expect(TextoDecimal.safeParse(0.1).success).toBe(false);
  });

  it("árvore de regras recursiva", () => {
    const regra = {
      tipo: "e",
      regras: [
        {
          tipo: "comparar",
          esquerda: { tipo: "preco" },
          comparador: "<",
          direita: {
            tipo: "multiplicar",
            operando: { tipo: "indicador", nome: "sma", periodo: 15 },
            fator: 0.99,
          },
        },
        {
          tipo: "nao",
          regra: {
            tipo: "comparar",
            esquerda: { tipo: "indicador", nome: "rsi", periodo: 14 },
            comparador: ">",
            direita: { tipo: "numero", valor: 70 },
          },
        },
      ],
    };
    expect(RegraEsquema.safeParse(regra).success).toBe(true);
    expect(RegraEsquema.safeParse({ tipo: "talvez" }).success).toBe(false);
  });

  it("proposta do agente: confiança entre 0 e 1 e justificativa obrigatória", () => {
    const ok = {
      acao: "comprar",
      confianca: 0.7,
      tamanhoRelativo: 1,
      stop: "58800",
      alvo: "61000",
      justificativa: "preço abaixo da média",
      riscos: [],
      fontes: [{ tipo: "diario", id: "482", titulo: "caso parecido" }],
    };
    expect(PropostaAgenteEsquema.safeParse(ok).success).toBe(true);
    expect(PropostaAgenteEsquema.safeParse({ ...ok, confianca: 1.2 }).success).toBe(false);
    expect(PropostaAgenteEsquema.safeParse({ ...ok, justificativa: "" }).success).toBe(false);
  });

  it("estratégia, limites, decisão, ordem e eventos", () => {
    expect(
      EstrategiaEsquema.safeParse({
        id: "e1",
        nome: "Média",
        versao: 1,
        entrada: {
          tipo: "comparar",
          esquerda: { tipo: "preco" },
          comparador: "<",
          direita: { tipo: "numero", valor: 1 },
        },
        stop: 0.02,
        alvoLiquido: 0.005,
        taxa: 0.001,
      }).success,
    ).toBe(true);
    expect(
      LimitesRiscoEsquema.safeParse({
        perdaDiariaMaxima: "50",
        exposicaoMaxima: "1000",
        riscoPorOperacao: "10",
        ordensPorHoraMax: 6,
        pausaAposPerdaMin: 15,
        confiancaMinima: 0.6,
      }).success,
    ).toBe(true);
    const decisao = {
      id: "d1",
      roboId: "r1",
      em: 1,
      sinal: { acao: "COMPRAR", explicacao: "x" },
      preco: "60000",
      risco: { aprovada: true, barreiras: [] },
      estado: "registrada",
    };
    expect(DecisaoEsquema.safeParse(decisao).success).toBe(true);
    expect(
      OrdemEsquema.safeParse({
        id: "o1",
        decisaoId: "d1",
        idCliente: "zt-abc",
        simbolo: "BTCUSDT",
        lado: "COMPRA",
        quantidade: "0.001",
        estado: "PREENCHIDA",
        criadaEm: 1,
        execucoes: [],
      }).success,
    ).toBe(true);
    expect(
      OrdemEsquema.safeParse({
        id: "o1",
        decisaoId: "d1",
        idCliente: "com espaço",
        simbolo: "BTCUSDT",
        lado: "COMPRA",
        quantidade: "0.001",
        estado: "PREENCHIDA",
        criadaEm: 1,
        execucoes: [],
      }).success,
    ).toBe(false);
    expect(EventoEsquema.safeParse({ tipo: "decisao", decisao }).success).toBe(true);
    expect(EventoEsquema.safeParse({ tipo: "saude", servico: "motor", ok: true, em: 1 }).success).toBe(true);
  });
});

describe("eventos ao vivo novos", () => {
  it("análise passo a passo, candle, sinal e posição", () => {
    const ok = (e: unknown) => EventoEsquema.safeParse(e).success;
    expect(
      ok({
        tipo: "analise",
        analiseId: "a1",
        roboId: "r1",
        concluida: false,
        etapa: { ferramenta: "retrato_mercado", descricao: "lendo o mercado", em: 1 },
      }),
    ).toBe(true);
    expect(
      ok({
        tipo: "analise",
        analiseId: "a1",
        roboId: "r1",
        concluida: true,
        resultado: "aguardar",
        decisaoId: "d1",
      }),
    ).toBe(true);
    expect(
      ok({
        tipo: "candle",
        roboId: "r1",
        simbolo: "BTCUSDT",
        intervalo: "1m",
        candle: { abertura: 1, abre: "1", maxima: "2", minima: "0.5", fecha: "1.5", volume: "10" },
      }),
    ).toBe(true);
    expect(ok({ tipo: "sinal", roboId: "r1", acao: "COMPRAR", explicacao: "x", preco: "100", em: 1 })).toBe(
      true,
    );
    expect(
      ok({
        tipo: "posicao",
        roboId: "r1",
        simbolo: "BTCUSDT",
        quantidade: "0.006",
        precoMedio: "83000",
        resultadoRealizado: "0",
        taxasPagas: "0.5",
        em: 1,
      }),
    ).toBe(true);
    expect(
      ok({
        tipo: "candle",
        roboId: "r1",
        simbolo: "BTCUSDT",
        intervalo: "1m",
        candle: { abertura: 1, abre: 1 },
      }),
    ).toBe(false);
  });
});

describe("proteção na corretora no evento de posição", () => {
  const posicao = {
    tipo: "posicao",
    roboId: "6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b",
    simbolo: "BTCUSDT",
    quantidade: "0.01",
    precoMedio: "60000",
    resultadoRealizado: "0",
    taxasPagas: "0.6",
    em: 1_760_000_000_000,
  };
  const protecao = {
    estado: "ATIVA",
    stop: "58800",
    limite: "58212",
    alvo: "61200.5",
    quantidade: "0.01",
    atualizadaEm: 1_760_000_000_000,
  };

  it("leva a proteção quando há uma; sem ela, continua valendo", () => {
    expect(EventoEsquema.safeParse({ ...posicao, protecaoCorretora: protecao }).success).toBe(true);
    expect(EventoEsquema.safeParse(posicao).success).toBe(true);
  });

  it("recusa estado desconhecido e preço que não é decimal em texto", () => {
    const estado = { ...posicao, protecaoCorretora: { ...protecao, estado: "VIVA" } };
    const preco = { ...posicao, protecaoCorretora: { ...protecao, stop: 58800 } };
    expect(EventoEsquema.safeParse(estado).success).toBe(false);
    expect(EventoEsquema.safeParse(preco).success).toBe(false);
  });
});
