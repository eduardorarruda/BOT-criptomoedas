import type { BetaRunnableTool } from "@anthropic-ai/sdk/lib/tools/BetaRunnableTool";
import { buscarConhecimento } from "./buscar-conhecimento.js";
import type { ContextoAnalise, DependenciasFerramentas } from "./contexto.js";
import {
  observar,
  paraAnthropic,
  type AoFalharFerramenta,
  type AoUsarFerramenta,
  type FerramentaLeitura,
} from "./definicao.js";
import { historicoDecisoes } from "./historico-decisoes.js";
import { posicaoEOrcamento } from "./posicao-orcamento.js";
import { retratoMercado } from "./retrato-mercado.js";

export type {
  ContextoAnalise,
  AvaliacaoPassada,
  DecisaoPassada,
  DependenciasFerramentas,
  PortaHistoricoDecisoes,
} from "./contexto.js";
export {
  definirFerramenta,
  esquemaJson,
  executarFerramenta,
  mensagemDeFalha,
  observar,
  paraAnthropic,
  type AoFalharFerramenta,
  type AoUsarFerramenta,
  type FerramentaLeitura,
  type ResultadoFerramenta,
} from "./definicao.js";
export { RegistroFontes } from "./registro.js";

export const NOMES_FERRAMENTAS = [
  "retrato_mercado",
  "posicao_e_orcamento",
  "buscar_conhecimento",
  "historico_decisoes",
] as const;

/**
 * Ferramentas de uma análise, sempre na mesma ordem e com as mesmas definições: o
 * prefixo (ferramentas + system) fica idêntico entre pedidos e o cache de prompt pega.
 * Nenhuma delas envia ordem.
 */
export function ferramentasDaAnalise(
  ctx: ContextoAnalise,
  deps: DependenciasFerramentas,
  aoUsar?: AoUsarFerramenta,
): FerramentaLeitura[] {
  return observar(
    [
      retratoMercado(ctx),
      posicaoEOrcamento(ctx),
      buscarConhecimento(ctx, deps),
      historicoDecisoes(ctx, deps),
    ],
    aoUsar,
  );
}

/** As mesmas ferramentas no formato do Tool Runner do SDK da Anthropic. */
export function criarFerramentas(
  ctx: ContextoAnalise,
  deps: DependenciasFerramentas,
  aoUsar?: AoUsarFerramenta,
  aoFalhar?: AoFalharFerramenta,
): BetaRunnableTool[] {
  return ferramentasDaAnalise(ctx, deps, aoUsar).map((f) => paraAnthropic(f, aoFalhar));
}
