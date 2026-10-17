import { describe, expect, it } from "vitest";
import type { ContextoMercado } from "./contexto.js";
import { dec, type Valor } from "./dinheiro.js";
import { decidir, decidirComSentido, validarEstrategia, type Estrategia } from "./estrategia.js";
import { POSICAO_ZERADA } from "./posicao.js";
import { precoAlvo, precoEmpate, precoStop } from "./precos.js";
import type { Regra } from "./regras.js";
import { atualizarStop, iniciarAcompanhamento, stopDeEntrada, type Acompanhamento } from "./saidas.js";
import { aFavor, contra, direcaoDe, fatorSentido, melhorPara, sentidosDa } from "./sentido.js";

const sempre: Regra = {
  tipo: "comparar",
  esquerda: { tipo: "preco" },
  comparador: ">",
  direita: { tipo: "numero", valor: 0 },
};
const nunca: Regra = { tipo: "nao", regra: sempre };

const base: Estrategia = { entrada: sempre, stop: 0.1, alvoLiquido: 0.5, taxa: 0 };
const vendida: Estrategia = { ...base, direcao: "vendido", entradaVendida: sempre };

/** Amplitude fixa 2 em torno dos fechamentos: ATR = 2 sem gaps. */
const contexto = (fechamentos: readonly number[]): ContextoMercado => ({
  fechamentos,
  maximas: fechamentos.map((f) => f + 1),
  minimas: fechamentos.map((f) => f - 1),
});
const plano = contexto(Array<number>(20).fill(100));

describe("sentido: comprado e vendido", () => {
  it("fator, a favor, contra, o melhor e os sentidos de cada direção", () => {
    expect([fatorSentido("comprado"), fatorSentido("vendido")]).toEqual([1, -1]);
    expect(aFavor(dec(11), dec(10), "comprado")).toBe(true);
    expect(aFavor(dec(11), dec(10), "vendido")).toBe(false);
    expect(contra(dec(9), dec(10), "comprado")).toBe(true);
    expect(contra(dec(11), dec(10), "vendido")).toBe(true);
    expect(melhorPara(dec(9), dec(10), "vendido").toNumber()).toBe(9);
    expect(melhorPara(dec(9), dec(10), "comprado").toNumber()).toBe(10);
    expect(sentidosDa("ambos")).toEqual(["comprado", "vendido"]);
    expect(sentidosDa("vendido")).toEqual(["vendido"]);
    expect(direcaoDe({})).toBe("comprado");
  });
});

describe("preços do lado vendido (o espelho do comprado)", () => {
  it("stop acima da entrada e alvo abaixo", () => {
    expect(precoStop(dec(100), 0.02, "vendido").toNumber()).toBe(102);
    expect(precoAlvo(dec(100), 0.05, 0, "vendido").toNumber()).toBe(95);
    expect(precoEmpate(dec(100), 0, "vendido").toNumber()).toBe(100);
  });

  it("com taxa, recomprar no alvo deixa exatamente o lucro líquido pedido", () => {
    const t = 0.001;
    const alvo = precoAlvo(dec(100), 0.01, t, "vendido");
    // vende 100 recebendo 100 × (1 − t); recompra no alvo pagando alvo × (1 + t)
    const recebido = dec(100).times(1 - t);
    const lucro = recebido.minus(alvo.times(1 + t)).div(recebido);
    expect(lucro.toNumber()).toBeCloseTo(0.01, 12);
    // empate: recomprar nele zera o resultado, com as duas taxas pagas
    const empate = precoEmpate(dec(100), t, "vendido");
    expect(
      recebido
        .minus(empate.times(1 + t))
        .abs()
        .lt(1e-20),
    ).toBe(true);
  });

  it("propriedade: sem taxa, as distâncias de stop e alvo são iguais nos dois sentidos", () => {
    const sorteio = gerador(7);
    for (let i = 0; i < 200; i++) {
      const entrada = dec(1000 + Math.floor(sorteio() * 200_000));
      const stop = 0.001 + sorteio() * 0.4;
      const alvo = 0.001 + sorteio() * 0.9;
      const dc = entrada.minus(precoStop(entrada, stop));
      const dv = precoStop(entrada, stop, "vendido").minus(entrada);
      expect(dc.equals(dv)).toBe(true);
      const ac = precoAlvo(entrada, alvo, 0).minus(entrada);
      const av = entrada.minus(precoAlvo(entrada, alvo, 0, "vendido"));
      expect(ac.equals(av)).toBe(true);
    }
  });
});

describe("stop de entrada vendido", () => {
  it("por ATR: entrada + k × ATR(n), com o stop percentual como teto", () => {
    const e = { ...vendida, stopAtr: { periodo: 14, multiplo: 2 } };
    const r = stopDeEntrada(e, dec(100), plano, "vendido");
    expect(r.stop.toString()).toBe("104");
    expect(r.explicacao).toBe("stop em 104 (preço + 2 × ATR(14) de 2)");
    const curto = stopDeEntrada({ ...e, stop: 0.02 }, dec(100), plano, "vendido");
    expect(curto.stop.toString()).toBe("102");
    expect(curto.explicacao).toMatch(/passaria do stop máximo de 2%/);
  });
});

const vendidoEm = (preco: number) => ({ precoMedio: dec(preco) });

describe("acompanhamento vendido: stop móvel e empate descem, nunca sobem", () => {
  it("começa com o stop acima da entrada e marca o sentido", () => {
    const a = iniciarAcompanhamento(vendida, vendidoEm(100), "vendido");
    expect(a).toEqual({
      entrada: dec(100),
      stop: dec(110),
      maxima: dec(100),
      candles: 0,
      sentido: "vendido",
    });
    // comprado continua sem o campo (igual a antes)
    expect(iniciarAcompanhamento(base, vendidoEm(100))).not.toHaveProperty("sentido");
  });

  it("stop móvel percentual acompanha a menor mínima e não volta", () => {
    const e: Estrategia = { ...vendida, stopMovel: { tipo: "percentual", distancia: 0.05 } };
    let a = iniciarAcompanhamento(e, vendidoEm(100), "vendido");
    const r1 = atualizarStop(e, a, contexto([90]));
    // menor mínima 89 → stop 89 × 1,05 = 93,45
    expect(r1.novoStop?.toString()).toBe("93.45");
    expect(r1.explicacao).toMatch(/^stop desceu de 110 para 93,45 \(stop móvel: 5% acima da mínima 89\)$/);
    a = r1.acompanhamento;
    const r2 = atualizarStop(e, a, contexto([95]));
    expect(r2.novoStop).toBeNull();
    expect(r2.acompanhamento.stop.toString()).toBe("93.45");
    expect(r2.acompanhamento.maxima.toString()).toBe("89");
    expect(r2.acompanhamento.candles).toBe(2);
  });

  it("stop móvel por ATR: menor mínima + k × ATR", () => {
    const e: Estrategia = { ...vendida, stopMovel: { tipo: "atr", periodo: 14, multiplo: 2 } };
    const a = iniciarAcompanhamento(e, vendidoEm(100), "vendido");
    const r = atualizarStop(e, a, contexto([...Array<number>(19).fill(100), 96]));
    // menor mínima 95; ATR ≈ 2 (um candle com gap de 4 pesa pouco) → stop ≈ 99
    expect(r.novoStop?.gt(98)).toBe(true);
    expect(r.novoStop?.lt(100)).toBe(true);
    expect(r.explicacao).toMatch(/mínima 95 \+ 2 × ATR\(14\)/);
  });

  it("empate: depois de cair o gatilho, o stop vai para a entrada (com as taxas)", () => {
    const e: Estrategia = { ...vendida, taxa: 0.001, empate: { gatilho: 0.03 } };
    const a = iniciarAcompanhamento(e, vendidoEm(100), "vendido");
    expect(atualizarStop(e, a, contexto([98.5])).novoStop).toBeNull(); // mínima 97,5: ainda não
    const r = atualizarStop(e, a, contexto([97.5]));
    expect(r.novoStop?.equals(precoEmpate(dec(100), 0.001, "vendido"))).toBe(true);
    expect(r.explicacao).toMatch(/o preço caiu 3% e o stop foi para o empate/);
  });
});

describe("decidir com sentido", () => {
  const ctx = (preco: number, acompanhamento?: Acompanhamento) => ({
    ...plano,
    preco: dec(preco),
    ...(acompanhamento ? { acompanhamento } : {}),
  });

  it("direção vendido: abre vendido com stop acima e alvo abaixo", () => {
    const s = decidirComSentido(vendida, ctx(100), null);
    expect(s).toMatchObject({ acao: "ABRIR", sentido: "vendido" });
    if (s.acao !== "ABRIR") return;
    expect(s.stop.toNumber()).toBe(110);
    expect(s.alvo.toNumber()).toBe(50);
    expect(s.explicacao).toMatch(/^venda: preço/);
  });

  it("direção ambos: abre o lado que disse sim; os dois juntos ficam de fora", () => {
    const soCompra: Estrategia = { ...base, direcao: "ambos", entradaVendida: nunca };
    expect(decidirComSentido(soCompra, ctx(100), null)).toMatchObject({ acao: "ABRIR", sentido: "comprado" });
    const soVenda: Estrategia = { ...base, entrada: nunca, direcao: "ambos", entradaVendida: sempre };
    expect(decidirComSentido(soVenda, ctx(100), null)).toMatchObject({ acao: "ABRIR", sentido: "vendido" });
    const dois: Estrategia = { ...base, direcao: "ambos", entradaVendida: sempre };
    const s = decidirComSentido(dois, ctx(100), null);
    expect(s.acao).toBe("AGUARDAR");
    expect(s.explicacao).toMatch(/compra e de venda deram sim no mesmo candle: fica de fora/);
    const nenhum: Estrategia = { ...base, entrada: nunca, direcao: "ambos", entradaVendida: nunca };
    expect(decidirComSentido(nenhum, ctx(100), null).explicacao).toMatch(/^compra: .*; venda: /);
  });

  it("vendido aberto: stop no preço acima, alvo abaixo, saída vendida e tempo", () => {
    const aberta = { sentido: "vendido" as const, precoMedio: dec(100) };
    expect(decidirComSentido(vendida, ctx(110), aberta)).toMatchObject({ acao: "ZERAR", motivo: "stop" });
    expect(decidirComSentido(vendida, ctx(50), aberta)).toMatchObject({ acao: "ZERAR", motivo: "alvo" });
    const espera = decidirComSentido(vendida, ctx(100), aberta);
    expect(espera.acao).toBe("AGUARDAR");
    expect(espera.explicacao).toBe("posição vendida aberta: stop em 110, alvo em 50");
    const comSaida = { ...vendida, saidaVendida: sempre };
    expect(decidirComSentido(comSaida, ctx(100), aberta)).toMatchObject({ motivo: "regra de saída" });
    // a regra de saída da compra não fecha a venda
    expect(decidirComSentido({ ...vendida, saida: sempre }, ctx(100), aberta).acao).toBe("AGUARDAR");
    const comTempo = { ...vendida, tempoMaximo: 3 };
    const a: Acompanhamento = {
      entrada: dec(100),
      stop: dec(110),
      maxima: dec(99),
      candles: 3,
      sentido: "vendido",
    };
    expect(decidirComSentido(comTempo, ctx(100, a), aberta)).toMatchObject({ motivo: "tempo" });
  });

  it("stop efetivo do vendido: o acompanhamento que desceu o stop vale", () => {
    const aberta = { sentido: "vendido" as const, precoMedio: dec(100) };
    const a: Acompanhamento = {
      entrada: dec(100),
      stop: dec(98),
      maxima: dec(90),
      candles: 4,
      sentido: "vendido",
    };
    const s = decidirComSentido(vendida, ctx(98, a), aberta);
    expect(s).toMatchObject({ acao: "ZERAR", motivo: "stop" });
    expect(s.explicacao).toBe("preço 98 chegou ao stop efetivo 98");
  });

  it("comprado aberto por aqui decide igual ao decidir de sempre", () => {
    const aberta = { sentido: "comprado" as const, precoMedio: dec(100) };
    expect(decidirComSentido(base, ctx(90), aberta)).toMatchObject({ acao: "ZERAR", motivo: "stop" });
    expect(decidirComSentido(base, ctx(150), aberta)).toMatchObject({ acao: "ZERAR", motivo: "alvo" });
  });
});

describe("cripto continua só comprado", () => {
  it("o decidir do à vista não abre posição com estratégia vendida ou nos dois sentidos", () => {
    const s = decidir(vendida, { ...plano, preco: dec(100) }, POSICAO_ZERADA);
    expect(s).toEqual({
      acao: "AGUARDAR",
      explicacao: "a estratégia opera vendida; no mercado à vista o robô só compra",
    });
    const ambos = decidir({ ...vendida, direcao: "ambos" }, { ...plano, preco: dec(100) }, POSICAO_ZERADA);
    expect(ambos.explicacao).toMatch(/nos dois sentidos/);
  });
});

describe("validação da direção", () => {
  it("vendido ou ambos pedem a entrada vendida; comprado não aceita regras vendidas", () => {
    expect(validarEstrategia(vendida)).toEqual([]);
    expect(validarEstrategia({ ...base, direcao: "ambos" })).toContain(
      "com a direção vendido ou ambos, a estratégia precisa da regra de entrada vendida",
    );
    expect(validarEstrategia({ ...base, saidaVendida: sempre })).toContain(
      "as regras do lado vendido só valem com a direção vendido ou ambos",
    );
    expect(validarEstrategia({ ...base, direcao: "lateral" as never })).toContain(
      "a direção precisa ser comprado, vendido ou ambos",
    );
    const vazia: Regra = { tipo: "e", regras: [] };
    expect(validarEstrategia({ ...vendida, entradaVendida: vazia })[0]).toMatch(/pelo menos uma condição/);
    expect(validarEstrategia({ ...vendida, saidaVendida: vazia })[0]).toMatch(/pelo menos uma condição/);
  });
});

/* ---------- propriedades de simetria: o vendido no preço espelhado é o comprado ---------- */

/** mulberry32: reproduzível pela semente. */
function gerador(semente: number): () => number {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** Passeio aleatório em pontos inteiros, com máxima e mínima em volta do fechamento. */
function passeio(semente: number, n: number): ContextoMercado {
  const s = gerador(semente);
  const fechamentos: number[] = [];
  const maximas: number[] = [];
  const minimas: number[] = [];
  let p = 120_000;
  for (let i = 0; i < n; i++) {
    p += Math.round((s() - 0.5) * 400);
    fechamentos.push(p);
    maximas.push(p + Math.round(s() * 150));
    minimas.push(p - Math.round(s() * 150));
  }
  return { fechamentos, maximas, minimas };
}

/** Preço espelhado em torno de C: p → C − p; a máxima vira a mínima. */
const C = 250_000;
const espelhar = (c: ContextoMercado): ContextoMercado => ({
  fechamentos: c.fechamentos.map((p) => C - p),
  maximas: (c.minimas ?? []).map((p) => C - p),
  minimas: (c.maximas ?? []).map((p) => C - p),
});
const ate = (c: ContextoMercado, fim: number): ContextoMercado => ({
  fechamentos: c.fechamentos.slice(0, fim + 1),
  maximas: c.maximas?.slice(0, fim + 1) ?? [],
  minimas: c.minimas?.slice(0, fim + 1) ?? [],
});
const espelho = (v: Valor): Valor => dec(C).minus(v);

const rompeTopo: Regra = {
  tipo: "comparar",
  esquerda: { tipo: "preco" },
  comparador: ">",
  direita: { tipo: "indicador", nome: "donchian", periodo: 10, saida: "superior" },
};
const rompeFundo: Regra = {
  tipo: "comparar",
  esquerda: { tipo: "preco" },
  comparador: "<",
  direita: { tipo: "indicador", nome: "donchian", periodo: 10, saida: "inferior" },
};
/** Stops por ATR (o percentual, 49%, nunca limita) e alvo que não chega: tudo espelha exato. */
const saidasSimetricas = {
  stop: 0.49,
  alvoLiquido: 0.99,
  taxa: 0,
  stopAtr: { periodo: 14, multiplo: 2 },
  stopMovel: { tipo: "atr", periodo: 14, multiplo: 3 },
  tempoMaximo: 25,
} as const;
const longa: Estrategia = { entrada: rompeTopo, ...saidasSimetricas };
const curta: Estrategia = {
  entrada: nunca,
  direcao: "vendido",
  entradaVendida: rompeFundo,
  ...saidasSimetricas,
};

describe("propriedade: o vendido no gráfico espelhado faz o mesmo que o comprado", () => {
  it.each([1, 2, 3, 4, 5, 6])("semente %i: mesmas entradas, stops espelhados, mesmas saídas", (semente) => {
    const original = passeio(semente, 220);
    const refletido = espelhar(original);
    let aC: Acompanhamento | null = null;
    let aV: Acompanhamento | null = null;
    let entradas = 0;
    for (let i = 30; i < 220; i++) {
      const cC = ate(original, i);
      const cV = ate(refletido, i);
      const pC = dec(original.fechamentos[i] as number);
      const pV = dec(refletido.fechamentos[i] as number);
      if (aC && aV) {
        const uC: Acompanhamento = atualizarStop(longa, aC, cC).acompanhamento;
        const uV: Acompanhamento = atualizarStop(curta, aV, cV).acompanhamento;
        expect(uV.stop.equals(espelho(uC.stop))).toBe(true);
        expect(uV.maxima.equals(espelho(uC.maxima))).toBe(true);
        const sC = decidirComSentido(
          longa,
          { ...cC, preco: pC, acompanhamento: uC },
          { sentido: "comprado", precoMedio: uC.entrada },
        );
        const sV = decidirComSentido(
          curta,
          { ...cV, preco: pV, acompanhamento: uV },
          { sentido: "vendido", precoMedio: uV.entrada },
        );
        expect(sV.acao).toBe(sC.acao);
        if (sC.acao === "ZERAR" && sV.acao === "ZERAR") expect(sV.motivo).toBe(sC.motivo);
        [aC, aV] = sC.acao === "ZERAR" ? [null, null] : [uC, uV];
        continue;
      }
      const sC = decidirComSentido(longa, { ...cC, preco: pC }, null);
      const sV = decidirComSentido(curta, { ...cV, preco: pV }, null);
      expect(sV.acao).toBe(sC.acao);
      if (sC.acao !== "ABRIR" || sV.acao !== "ABRIR") continue;
      entradas++;
      expect(sC.sentido).toBe("comprado");
      expect(sV.sentido).toBe("vendido");
      expect(sV.stop.equals(espelho(sC.stop))).toBe(true);
      aC = { ...iniciarAcompanhamento(longa, { precoMedio: pC }), stop: sC.stop };
      aV = { ...iniciarAcompanhamento(curta, { precoMedio: pV }, "vendido"), stop: sV.stop };
    }
    expect(entradas).toBeGreaterThan(0);
  });
});
