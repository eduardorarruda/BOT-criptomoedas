import type { DecisaoDTO, PropostaAgente } from "@zentrade/contratos/esquemas";
import { describe, expect, it } from "vitest";
import { explicarDecisao } from "./porque";

const proposta = (extra: Partial<PropostaAgente> = {}): PropostaAgente => ({
  acao: "comprar",
  confianca: 0.64,
  tamanhoRelativo: 1,
  justificativa: "recuo dentro da alta",
  riscos: [],
  fontes: [],
  cenarios: [
    {
      nome: "alta",
      probabilidade: 0.65,
      horizonte: 24,
      gatilho: "g",
      invalidacao: "i",
      resultadoEstimado: 3,
    },
    {
      nome: "lateral",
      probabilidade: 0.25,
      horizonte: 24,
      gatilho: "g",
      invalidacao: "i",
      resultadoEstimado: -0.2,
    },
    {
      nome: "baixa",
      probabilidade: 0.1,
      horizonte: 24,
      gatilho: "g",
      invalidacao: "i",
      resultadoEstimado: -2.7,
    },
  ],
  avaliacao: {
    valorEsperado: 1.63,
    favoravel: "alta",
    probabilidadeFavoravel: 0.65,
    limiar: 0.6,
    aplicada: true,
    aprovada: true,
    motivo: "valor esperado positivo e chance acima do mínimo",
  },
  ...extra,
});

const decisao = (p: PropostaAgente | undefined, extra: Partial<DecisaoDTO> = {}): DecisaoDTO => ({
  id: "d1",
  roboId: "r1",
  em: 1,
  sinal: { acao: "COMPRAR", explicacao: "x" },
  preco: "100",
  risco: { aprovada: true, barreiras: [] },
  estado: "executada",
  ...(p ? { proposta: p } : {}),
  ...extra,
});

describe("por que a decisão saiu assim", () => {
  it("entrada sustentada: o favorável decide e os outros dois dizem por que não", () => {
    const e = explicarDecisao(decisao(proposta()));
    expect(e?.veredito).toMatchObject({ titulo: "Os cenários sustentaram a entrada", tom: "ganho" });
    expect(e?.veredito.motivo).toContain("+1,63%");
    expect(e?.futuros.map((f) => [f.cenario.nome, f.papel])).toEqual([
      ["alta", "decisivo"],
      ["lateral", "outro"],
      ["baixa", "outro"],
    ]);
    expect(e?.futuros[0]?.texto).toContain("Passou do mínimo");
    expect(e?.futuros[1]?.texto).toContain("Não decidiu");
    expect(e?.futuros[2]?.texto).toContain("levaria a −2,70%");
  });

  it("favorável abaixo do limiar: regra dos cenários barra, e o futuro contrário mais provável pesa contra", () => {
    const p = proposta({
      cenarios: [
        {
          nome: "alta",
          probabilidade: 0.3,
          horizonte: 12,
          gatilho: "g",
          invalidacao: "i",
          resultadoEstimado: 3,
        },
        {
          nome: "lateral",
          probabilidade: 0.2,
          horizonte: 12,
          gatilho: "g",
          invalidacao: "i",
          resultadoEstimado: -0.2,
        },
        {
          nome: "baixa",
          probabilidade: 0.5,
          horizonte: 12,
          gatilho: "g",
          invalidacao: "i",
          resultadoEstimado: -2.7,
        },
      ],
      avaliacao: {
        valorEsperado: -0.5,
        favoravel: "alta",
        probabilidadeFavoravel: 0.3,
        limiar: 0.6,
        aplicada: true,
        aprovada: false,
        motivo: "a chance do favorável (30%) ficou abaixo do mínimo de 60%",
      },
    });
    const e = explicarDecisao(
      decisao(p, {
        estado: "barrada",
        risco: { aprovada: false, barreiras: [{ codigo: "cenarios", mensagem: "m" }] },
      }),
    );
    expect(e?.veredito).toMatchObject({ titulo: "A regra dos cenários barrou a entrada", tom: "atencao" });
    expect(e?.futuros[0]?.texto).toContain("abaixo do mínimo de 60%: não sustentou a entrada");
    const baixa = e?.futuros.find((f) => f.cenario.nome === "baixa");
    expect(baixa?.texto).toContain("MAIS provável");
    expect(baixa?.texto).toContain("É o peso contra a entrada");
  });

  it("veto grave e agente que propõe aguardar têm prioridade na frase", () => {
    expect(explicarDecisao(decisao(proposta({ vetoGrave: "notícia de hackeamento" })))?.veredito.titulo).toBe(
      "O Claude vetou",
    );
    const aguardar = decisao(proposta({ acao: "aguardar" }), {
      estado: "registrada",
      risco: { aprovada: false, barreiras: [{ codigo: "agente_aguardar", mensagem: "m" }] },
    });
    expect(explicarDecisao(aguardar)?.veredito).toMatchObject({
      titulo: "O Claude propôs aguardar",
      motivo: "recuo dentro da alta",
    });
  });

  it("barreira do risco (não do Claude) aparece com a mensagem dela", () => {
    const d = decisao(proposta({ avaliacao: undefined }), {
      estado: "barrada",
      risco: {
        aprovada: false,
        barreiras: [{ codigo: "exposicao", mensagem: "Passa da exposição máxima." }],
      },
    });
    expect(explicarDecisao(d)?.veredito).toEqual({
      titulo: "O risco barrou a entrada",
      motivo: "Passa da exposição máxima.",
      tom: "atencao",
    });
  });

  it("Claude não analisou: nada a explicar; proposta antiga, sem futuros: só o veredito", () => {
    expect(explicarDecisao(decisao(undefined))).toBeNull();
    const antiga = explicarDecisao(decisao(proposta({ cenarios: undefined, avaliacao: undefined })));
    expect(antiga?.futuros).toEqual([]);
    expect(antiga?.veredito.titulo).toBe("Os cenários só informam");
  });
});
