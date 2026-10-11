import type { PedidoAnalise, PortaAgente, RespostaAnalise } from "@zentrade/contratos";
import { dec } from "@zentrade/dominio";

export type ComportamentoAgente = "sempre_concorda" | "nunca_concorda" | "falha";

/**
 * Agente previsível para backtest e desenvolvimento: concorda sempre, nunca, ou
 * finge estar fora do ar. Sem rede, sem custo, sem IA.
 */
export class AgenteFixo implements PortaAgente {
  constructor(
    private readonly comportamento: ComportamentoAgente,
    private readonly confianca = 1,
  ) {}

  analisar(pedido: PedidoAnalise): Promise<RespostaAnalise> {
    if (this.comportamento === "falha")
      return Promise.reject(new Error("Agente fixo configurado para falhar (simula o agente fora do ar)."));
    const concorda = this.comportamento === "sempre_concorda";
    const acao = !concorda ? "aguardar" : pedido.sinal.acao === "COMPRAR" ? "comprar" : "vender";
    return Promise.resolve({
      proposta: {
        acao,
        confianca: this.confianca,
        tamanhoRelativo: 1,
        justificativa: concorda ? "Agente fixo: concorda com a regra." : "Agente fixo: nunca concorda.",
        riscos: [],
        fontes: [],
      },
      custoUsd: dec(0),
    });
  }
}
