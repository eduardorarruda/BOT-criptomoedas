import type { BetaRunnableTool } from "@anthropic-ai/sdk/lib/tools/BetaRunnableTool";
import { buscarConhecimento } from "./buscar-conhecimento.js";
import type { ContextoAnalise, DependenciasFerramentas } from "./contexto.js";
import { historicoDecisoes } from "./historico-decisoes.js";
import { posicaoEOrcamento } from "./posicao-orcamento.js";
import { retratoMercado } from "./retrato-mercado.js";

export type {
  ContextoAnalise,
  DecisaoPassada,
  DependenciasFerramentas,
  PortaHistoricoDecisoes,
} from "./contexto.js";
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
export function criarFerramentas(ctx: ContextoAnalise, deps: DependenciasFerramentas): BetaRunnableTool[] {
  return [
    retratoMercado(ctx),
    posicaoEOrcamento(ctx),
    buscarConhecimento(ctx, deps),
    historicoDecisoes(ctx, deps),
  ];
}
