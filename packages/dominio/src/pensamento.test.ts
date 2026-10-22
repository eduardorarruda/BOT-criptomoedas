import { describe, expect, it } from "vitest";
import { dec } from "./dinheiro.js";
import type { Estrategia, Sinal } from "./estrategia.js";
import { montarPensamento } from "./pensamento.js";
import type { Regra } from "./regras.js";

const HORA = 3_600_000;
const sma200 = { tipo: "indicador", nome: "sma", periodo: 200 } as const;
const acimaDaMedia: Regra = {
  tipo: "comparar",
  esquerda: { tipo: "preco" },
  comparador: ">",
  direita: sma200,
};
const saidaPorPreco: Regra = {
  tipo: "comparar",
  esquerda: { tipo: "preco" },
  comparador: "<",
  direita: { tipo: "numero", valor: 90 },
};
const estrategia: Estrategia = {
  entrada: acimaDaMedia,
  saida: saidaPorPreco,
  stop: 0.05,
  alvoLiquido: 0.1,
  taxa: 0.001,
};
const lateral = [...Array<number>(499).fill(100), 99.6];
const base = {
  estrategia,
  ctx: { fechamentos: lateral },
  preco: dec("99.6"),
  em: 1_000,
  intervaloMs: HORA,
  agente: "decide" as const,
};
const aguardar: Sinal = { acao: "AGUARDAR", explicacao: "x" };

describe("o pensamento do robô a cada vela", () => {
  it("sem sinal e sem posição: fica de fora dizendo qual condição falhou, com o cenário", () => {
    const p = montarPensamento({ ...base, sinal: aguardar, posicionado: false });
    expect(p.sinal).toBe("AGUARDAR");
    expect(p.cenario.cenario).toBe("lateral");
    expect(p.regraAvaliada).toBe("entrada");
    expect(p.condicoes?.valor).toBe(false);
    expect(p.conclusao).toMatch(
      /^Fico de fora: não é verdade que preço \(99,6\) > SMA\(200\) \(99,998\d*\)\.$/,
    );
    expect(p.preco).toBe("99.6");
  });

  it("COMPRAR com o Claude decidindo: diz que ele vai conferir", () => {
    const sinal: Sinal = {
      acao: "COMPRAR",
      stop: dec("95"),
      alvo: dec("110"),
      explicacao: "preço acima da média",
    };
    const p = montarPensamento({ ...base, sinal, posicionado: false });
    expect(p.conclusao).toBe("Compro: preço acima da média. O Claude confere antes da ordem.");
  });

  it("COMPRAR com o Claude desligado: só a regra e o risco decidem", () => {
    const sinal: Sinal = { acao: "COMPRAR", stop: dec("95"), alvo: dec("110"), explicacao: "ok" };
    const p = montarPensamento({ ...base, sinal, posicionado: false, agente: "desligado" });
    expect(p.agente).toBe("desligado");
    expect(p.conclusao).toBe("Compro: ok. Claude desligado: só a regra e o risco decidem.");
  });

  it("posicionado e sem saída: mantém, mostrando a regra de saída", () => {
    const p = montarPensamento({
      ...base,
      sinal: { acao: "AGUARDAR", explicacao: "posição aberta: stop em 95, alvo em 110" },
      posicionado: true,
    });
    expect(p.regraAvaliada).toBe("saida");
    expect(p.conclusao).toBe("Mantenho a posição: posição aberta: stop em 95, alvo em 110.");
  });

  it("venda diz o motivo", () => {
    const p = montarPensamento({
      ...base,
      sinal: { acao: "VENDER", motivo: "stop", explicacao: "preço 94 chegou ao stop 95" },
      posicionado: true,
    });
    expect(p.motivoSaida).toBe("stop");
    expect(p.conclusao).toBe("Saio pelo stop: preço 94 chegou ao stop 95.");
  });

  it("estratégia sem regra a avaliar (posicionado e sem saída): sem condições", () => {
    const { saida: _s, ...semSaida } = estrategia;
    const p = montarPensamento({ ...base, estrategia: semSaida, sinal: aguardar, posicionado: true });
    expect(p.condicoes).toBeNull();
    expect(p.regraAvaliada).toBe("nenhuma");
  });

  it("muitos motivos: mostra três e conta o resto", () => {
    const falha = (n: number): Regra => ({
      tipo: "comparar",
      esquerda: { tipo: "preco" },
      comparador: ">",
      direita: { tipo: "numero", valor: n },
    });
    const p = montarPensamento({
      ...base,
      estrategia: {
        ...estrategia,
        entrada: { tipo: "e", regras: [falha(1000), falha(2000), falha(3000), falha(4000)] },
      },
      sinal: aguardar,
      posicionado: false,
    });
    expect(p.conclusao).toContain("e mais 1");
  });
});
