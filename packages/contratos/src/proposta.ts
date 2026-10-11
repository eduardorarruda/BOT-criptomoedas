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

export const PropostaAgenteEsquema = z.object({
  acao: z.enum(["comprar", "vender", "aguardar"]),
  confianca: Fracao,
  tamanhoRelativo: Fracao.describe("1 = o tamanho que o risco permite; menos que 1 reduz a ordem"),
  stop: TextoDecimal.optional(),
  alvo: TextoDecimal.optional(),
  justificativa: z.string().min(1).max(2000),
  riscos: z.array(z.string().max(300)).max(10),
  fontes: z.array(FonteEsquema).max(20),
});
export type PropostaAgente = z.infer<typeof PropostaAgenteEsquema>;
