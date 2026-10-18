import type { Cenario, PropostaGerada } from "@zentrade/contratos";

/** Três cenários coerentes: valor esperado = 0,5 × 1,2 + 0,3 × (−0,25) + 0,2 × (−0,9) = +0,345%. */
export const CENARIOS: Cenario[] = [
  {
    nome: "alta",
    probabilidade: 0.5,
    horizonte: 12,
    gatilho: "fechar acima de 60.600",
    invalidacao: "fechar abaixo de 60.200",
    resultadoEstimado: 1.2,
  },
  {
    nome: "lateral",
    probabilidade: 0.3,
    horizonte: 24,
    gatilho: "ficar entre 60.200 e 60.600",
    invalidacao: "romper qualquer ponta",
    resultadoEstimado: -0.25,
  },
  {
    nome: "baixa",
    probabilidade: 0.2,
    horizonte: 6,
    gatilho: "perder 60.200",
    invalidacao: "voltar acima de 60.450",
    resultadoEstimado: -0.9,
  },
];

/** A proposta de compra que o modelo devolve no formato novo. */
export const PROPOSTA_GERADA: PropostaGerada = {
  acao: "comprar",
  confianca: 0.7,
  tamanhoRelativo: 0.5,
  stop: "58800",
  alvo: "61000",
  justificativa: "Preço abaixo da média; a taxa de 0,1% cabe no alvo.",
  riscos: ["mercado em queda"],
  fontes: [{ tipo: "regra_corretora", id: "doc-taxas", titulo: "Taxas da corretora", data: "2026-09-01" }],
  cenarios: CENARIOS,
  contraArgumento: "O volume não confirma o rompimento.",
};

/** Os mesmos cenários com outras probabilidades (alta, lateral, baixa). */
export const comProbabilidades = (alta: number, lateral: number, baixa: number): Cenario[] =>
  CENARIOS.map((c) => ({
    ...c,
    probabilidade: c.nome === "alta" ? alta : c.nome === "lateral" ? lateral : baixa,
  }));
