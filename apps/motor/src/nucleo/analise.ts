import type { PropostaAgente, RespostaAnalise, RoboConfig } from "@zentrade/contratos";
import type { Posicao, Sinal, Valor } from "@zentrade/dominio";
import type { Dependencias } from "./tipos.js";

export type ResultadoAnalise =
  | { readonly tipo: "ok"; readonly resposta: RespostaAnalise }
  | { readonly tipo: "falhou"; readonly motivo: string };

export interface PedidoDoCiclo {
  readonly sinal: Sinal;
  readonly preco: Valor;
  readonly fechamentos: readonly number[];
  readonly posicao: Posicao;
}

/** Pede a análise ao agente. Falha não é engolida: vira resultado com o motivo. */
export async function consultarAgente(
  deps: Dependencias,
  robo: RoboConfig,
  p: PedidoDoCiclo,
): Promise<ResultadoAnalise> {
  try {
    const resposta = await deps.agente.analisar({
      robo: { id: robo.id, simbolo: robo.simbolo, intervalo: robo.intervalo },
      sinal: p.sinal,
      preco: p.preco,
      fechamentos: p.fechamentos,
      posicao: p.posicao,
    });
    return { tipo: "ok", resposta };
  } catch (erro) {
    const motivo = erro instanceof Error ? erro.message : String(erro);
    deps.registro.warn({ roboId: robo.id, erro }, "agente indisponível");
    return { tipo: "falhou", motivo };
  }
}

/** O agente concorda quando propõe a mesma ação do sinal da regra. */
export const concorda = (proposta: PropostaAgente, sinal: Sinal): boolean =>
  (sinal.acao === "COMPRAR" && proposta.acao === "comprar") ||
  (sinal.acao === "VENDER" && proposta.acao === "vender");
