import type { BuscaConhecimento } from "@zentrade/conhecimento";
import type { PedidoAnalise } from "@zentrade/contratos";
import type { Valor } from "@zentrade/dominio";
import type { OrcamentoRisco } from "../serializacao.js";
import type { RegistroFontes } from "./registro.js";

/** O que cada ferramenta enxerga de uma análise. */
export interface ContextoAnalise {
  readonly pedido: PedidoAnalise;
  readonly usuarioId: string;
  readonly orcamento?: OrcamentoRisco;
  readonly registro: RegistroFontes;
}

export interface DecisaoPassada {
  readonly id: string;
  readonly em: number;
  readonly sinal: "COMPRAR" | "VENDER" | "AGUARDAR";
  readonly acaoProposta: "comprar" | "vender" | "aguardar" | null;
  readonly estado: string;
  readonly preco: Valor;
  /** Resultado líquido da operação, quando já avaliado. */
  readonly resultado: Valor | null;
  readonly explicacao: string;
}

/** Decisões anteriores do robô. A implementação SQL está em postgres/historico.ts. */
export interface PortaHistoricoDecisoes {
  recentes(roboId: string, limite: number): Promise<DecisaoPassada[]>;
}

export interface DependenciasFerramentas {
  readonly busca: BuscaConhecimento;
  readonly historico: PortaHistoricoDecisoes;
}

export const dataCurta = (d: Date | number): string => new Date(d).toISOString().slice(0, 10);
export const json = (valor: unknown): string => JSON.stringify(valor);
