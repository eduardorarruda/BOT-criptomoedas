import { describe, expect, it } from "vitest";
import { DecisaoEsquema } from "./dados.js";
import { EventoEsquema } from "./eventos.js";
import { PensamentoEsquema } from "./pensamento.js";

const cenario = {
  cenario: "lateral",
  precoVsSma200: -0.4,
  precoVsSma400: null,
  inclinacaoSma200: 0,
  limiarInclinacao: 0.5,
  variacao7d: -0.4,
  janelaVariacaoHoras: 168,
  atrPct: 1,
  atrPercentil: 100,
  eficiencia: 0,
  texto: "Lateral: o preço está 0,4% abaixo da média de 200 velas, que está quase parada.",
};
const condicoes = {
  tipo: "e",
  valor: false,
  texto: "todas estas",
  filhos: [{ tipo: "condicao", valor: false, texto: "preço (99,6) > SMA(200) (100)" }],
};
const pensamento = {
  em: 1_000,
  preco: "99.6",
  sinal: "AGUARDAR",
  posicionado: false,
  regraAvaliada: "entrada",
  condicoes,
  cenario,
  agente: "decide",
  explicacao: "x",
  conclusao: "Fico de fora.",
};

describe("pensamento do robô", () => {
  it("aceita o pensamento com condições aninhadas e rejeita cenário desconhecido", () => {
    expect(PensamentoEsquema.safeParse(pensamento).success).toBe(true);
    expect(
      PensamentoEsquema.safeParse({ ...pensamento, cenario: { ...cenario, cenario: "voando" } }).success,
    ).toBe(false);
  });

  it("vira evento ao vivo", () => {
    const e = EventoEsquema.safeParse({ tipo: "pensamento", roboId: "r1", pensamento });
    expect(e.success).toBe(true);
  });

  it("a decisão carrega o regime e as condições, e as antigas (sem eles) continuam válidas", () => {
    const base = {
      id: "d1",
      roboId: "r1",
      em: 1,
      sinal: { acao: "COMPRAR", explicacao: "x" },
      preco: "1",
      risco: { aprovada: true, barreiras: [] },
      estado: "executada",
    };
    expect(DecisaoEsquema.safeParse(base).success).toBe(true);
    const nova = DecisaoEsquema.safeParse({ ...base, regime: cenario, condicoes });
    expect(nova.success).toBe(true);
    expect(nova.data?.condicoes?.filhos?.[0]?.texto).toBe("preço (99,6) > SMA(200) (100)");
  });
});

describe("cenário por ativo", () => {
  const atual = (roboId: string, intervalo: "1h" | "5m", em: number, nome: "alta" | "queda") => ({
    roboId,
    simbolo: "BTCUSDT",
    intervalo,
    pensamento: { ...pensamento, em, cenario: { ...cenario, cenario: nome } } as never,
  });

  it("robôs do mesmo ativo e intervalo viram um cenário, o da leitura mais recente", async () => {
    const { cenariosDosAtuais } = await import("./pensamento.js");
    const r = cenariosDosAtuais([
      atual("r1", "1h", 10, "alta"),
      atual("r2", "1h", 20, "queda"),
      atual("r3", "5m", 5, "alta"),
    ]);
    expect(r).toHaveLength(2);
    const h = r.find((x) => x.intervalo === "1h");
    expect(h?.cenario.cenario).toBe("queda");
    expect(h?.roboIds.sort()).toEqual(["r1", "r2"]);
  });
});
