import { z } from "zod";
import { Instante, TextoDecimal } from "./comum.js";
import { CLASSES_PATRIMONIO } from "./valores.js";

export { CLASSES_PATRIMONIO };

/**
 * Patrimônio consolidado (`GET /api/v1/patrimonio/consolidado`; `GET /patrimonio` já é a
 * curva do resultado realizado dos robôs): a soma, em reais, da carteira
 * cripto, da renda fixa e do imobiliário, com o peso de cada classe. Só informa:
 * cada número vem das telas de cada classe, e o que não tem valor em reais fica
 * fora do total, dito em `situacao` e `avisos`.
 */

export const ClassePatrimonioEsquema = z.enum(CLASSES_PATRIMONIO);
export type ClassePatrimonio = z.infer<typeof ClassePatrimonioEsquema>;

/**
 * vazia: nada cadastrado. completa: tudo avaliado. parcial: entra com o que tem valor.
 * indisponivel: sem valor em reais agora (ex.: sem cotação USDT/BRL); fica fora do total.
 */
export const SituacaoClasseEsquema = z.enum(["vazia", "completa", "parcial", "indisponivel"]);
export type SituacaoClasse = z.infer<typeof SituacaoClasseEsquema>;

/** Reais por 1 USDT, do último preço do par na Binance (a mesma tabela de preços da carteira). */
export const CambioPatrimonioEsquema = z.object({
  par: z.literal("USDTBRL"),
  preco: TextoDecimal,
  em: Instante,
  fonte: z.literal("binance"),
});
export type CambioPatrimonio = z.infer<typeof CambioPatrimonioEsquema>;

export const ClassePatrimonioResumoEsquema = z.object({
  classe: ClassePatrimonioEsquema,
  situacao: SituacaoClasseEsquema,
  /** Em reais; null quando indisponível. Cripto: conta inteira; renda fixa: bruto; imobiliário: valor − dívida. */
  valor: TextoDecimal.nullable(),
  /** Quanto entrou, em reais; null quando não se sabe (cripto: o câmbio de cada compra não é registrado). */
  investido: TextoDecimal.nullable(),
  /** Fatia da composição (fração: 0,25 = 25%); null fora da soma ou com total zero. */
  fracao: TextoDecimal.nullable(),
  /** Moedas, títulos ou investimentos considerados. */
  itens: z.number().int().nonnegative(),
  /** Quando os dados de origem foram atualizados (preços, índices do BCB, cadastro). */
  atualizadoEm: Instante.nullable(),
  /** O valor na moeda em que a classe é medida, quando não é real (cripto: USDT). */
  moedaOrigem: z.object({ moeda: z.string(), valor: TextoDecimal }).nullable(),
  avisos: z.array(z.string()),
});
export type ClassePatrimonioResumo = z.infer<typeof ClassePatrimonioResumoEsquema>;

export const PatrimonioEsquema = z.object({
  moeda: z.literal("BRL"),
  /** Soma das classes com valor em reais. */
  total: TextoDecimal,
  /** Alguma classe ficou de fora do total ou entrou só em parte. */
  parcial: z.boolean(),
  calculadoEm: Instante,
  /** null quando não havia cotação USDT/BRL (ou nenhuma conta real na Binance). */
  cambio: CambioPatrimonioEsquema.nullable(),
  classes: z.array(ClassePatrimonioResumoEsquema),
  avisos: z.array(z.string()),
});
export type Patrimonio = z.infer<typeof PatrimonioEsquema>;
