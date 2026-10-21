import { z } from "zod";
import { Fracao, Id, TextoDecimal } from "./comum.js";

/**
 * O que o agente de IA devolve — e só isto. A proposta é saída estruturada, não uma
 * chamada de ferramenta: nenhuma ferramenta do agente envia ordem. A quantidade
 * final é calculada pelo dimensionamento (busca binária) e aprovada pelo motor de
 * risco; o agente só pode PEDIR menos tamanho (`tamanhoRelativo`).
 */
export const FonteEsquema = z.object({
  tipo: z.enum(["diario", "noticia", "regra_corretora", "estrategia", "nota"]),
  id: Id,
  titulo: z.string().min(1).max(200),
  data: z.string().max(40).optional(),
});
export type Fonte = z.infer<typeof FonteEsquema>;

/**
 * "Prévias de futuro": três caminhos do preço que o modelo pesa antes de propor. Os
 * nomes são do MERCADO (alta, lateral, baixa); numa operação vendida o favorável é a
 * baixa. `resultadoEstimado` é o resultado da operação proposta naquele cenário, em %
 * do preço e já líquido das taxas e do deslizamento de ida e volta.
 */
export const NOMES_CENARIOS = ["alta", "lateral", "baixa"] as const;
export const NomeCenario = z.enum(NOMES_CENARIOS);
export type NomeCenario = z.infer<typeof NomeCenario>;

/** Folga para o arredondamento das probabilidades (0,33 + 0,33 + 0,33). */
export const TOLERANCIA_SOMA_PROBABILIDADES = 0.01;

export const CenarioEsquema = z.object({
  nome: NomeCenario,
  probabilidade: Fracao,
  horizonte: z.number().int().min(1).max(1000).describe("em candles do intervalo do robô"),
  gatilho: z.string().min(1).max(300).describe("o que confirma este cenário"),
  invalidacao: z.string().min(1).max(300).describe("o que mata este cenário"),
  resultadoEstimado: z
    .number()
    .min(-100)
    .max(1000)
    .describe("% do preço, líquido de custos, da operação proposta neste cenário"),
});
export type Cenario = z.infer<typeof CenarioEsquema>;

export const CenariosEsquema = z
  .array(CenarioEsquema)
  .length(3)
  .superRefine((cenarios, ctx) => {
    const nomes = new Set(cenarios.map((c) => c.nome));
    if (nomes.size !== cenarios.length)
      ctx.addIssue({
        code: "custom",
        message: "os três cenários precisam ser alta, lateral e baixa, sem repetir",
      });
    const soma = cenarios.reduce((s, c) => s + c.probabilidade, 0);
    if (Math.abs(soma - 1) > TOLERANCIA_SOMA_PROBABILIDADES)
      ctx.addIssue({
        code: "custom",
        message: `as probabilidades precisam somar 1 (± ${TOLERANCIA_SOMA_PROBABILIDADES}); somam ${soma.toFixed(3)}`,
      });
  });

/**
 * O que o CÓDIGO concluiu dos cenários (nunca o modelo): valor esperado = Σ p × resultado,
 * o cenário favorável à operação e se a regra deixou a operação passar. `aplicada` é
 * falso quando a proposta não abre posição (aguardar, ou vender para sair): aí a
 * avaliação só informa.
 */
export const AvaliacaoCenariosEsquema = z.object({
  valorEsperado: z.number().min(-100).max(1000),
  favoravel: NomeCenario,
  probabilidadeFavoravel: Fracao,
  limiar: Fracao,
  aplicada: z.boolean(),
  aprovada: z.boolean(),
  motivo: z.string().min(1).max(300),
});
export type AvaliacaoCenarios = z.infer<typeof AvaliacaoCenariosEsquema>;

const LIMITE_CONTRA_ARGUMENTO = 600;

const PropostaBase = z.object({
  acao: z.enum(["comprar", "vender", "aguardar"]),
  confianca: Fracao,
  tamanhoRelativo: Fracao.describe("1 = o tamanho que o risco permite; menos que 1 reduz a ordem"),
  stop: TextoDecimal.optional(),
  alvo: TextoDecimal.optional(),
  justificativa: z.string().min(1).max(2000),
  riscos: z.array(z.string().max(300)).max(10),
  fontes: z.array(FonteEsquema).max(20),
  /**
   * Só com um risco concreto e grave que justifique NÃO operar mesmo com valor esperado
   * positivo nos cenários (notícia relevante, dado inconsistente, falta de liquidez).
   */
  vetoGrave: z
    .string()
    .min(1)
    .max(300)
    .optional()
    .describe("só um risco concreto e grave que justifique não operar mesmo com valor esperado positivo"),
});

/**
 * A proposta como o modelo precisa gerá-la agora: com os três cenários e o principal
 * argumento contra ela. É o esquema da saída estruturada (API e Claude Code).
 */
export const PropostaGeradaEsquema = PropostaBase.extend({
  cenarios: CenariosEsquema,
  contraArgumento: z
    .string()
    .min(1)
    .max(LIMITE_CONTRA_ARGUMENTO)
    .describe("o principal argumento CONTRA a própria proposta"),
});
export type PropostaGerada = z.infer<typeof PropostaGeradaEsquema>;

/**
 * A proposta como é lida (motor, banco, tela). Cenários e contra-argumento são
 * opcionais: propostas antigas não têm, e o "aguardar" de segurança também não.
 */
export const PropostaAgenteEsquema = PropostaBase.extend({
  cenarios: CenariosEsquema.optional(),
  contraArgumento: z.string().max(LIMITE_CONTRA_ARGUMENTO).optional(),
  avaliacao: AvaliacaoCenariosEsquema.optional(),
});
export type PropostaAgente = z.infer<typeof PropostaAgenteEsquema>;
