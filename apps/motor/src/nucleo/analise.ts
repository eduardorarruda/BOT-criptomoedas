import type { OrcamentoAnalise, PropostaAgente, RespostaAnalise, RoboConfig } from "@zentrade/contratos";
import type { Posicao, Sinal, Valor } from "@zentrade/dominio";
import { concluirAnalise, iniciarAnalise } from "./aovivo.js";
import { exposicao, inicioDoDia } from "./estado-risco.js";
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

/**
 * Orçamento de risco do robô para o agente pesar o tamanho. Sem ele o agente ainda
 * analisa: uma falha aqui vai para o registro e o pedido segue sem orçamento.
 */
async function orcamento(
  deps: Dependencias,
  robo: RoboConfig,
  p: PedidoDoCiclo,
): Promise<OrcamentoAnalise | undefined> {
  try {
    const resultadoDoDia = await deps.ordens.resultadoDesde(robo.id, inicioDoDia(deps.relogio.agora()));
    return {
      riscoPorOperacao: robo.riscoPorOperacao,
      exposicaoMaxima: robo.limites.exposicaoMaxima,
      perdaDiariaMaxima: robo.limites.perdaDiariaMaxima,
      exposicaoAtual: exposicao(p.posicao, p.preco),
      resultadoDoDia,
    };
  } catch (erro) {
    deps.registro.warn({ roboId: robo.id, erro }, "orçamento de risco indisponível: o agente vai sem ele");
    return undefined;
  }
}

/**
 * Pede a análise ao agente, com o `analiseId` que liga o passo a passo dele (eventos
 * "analise") a este pedido; a tela vê o início e o fim publicados aqui.
 */
export async function consultarAgente(
  deps: Dependencias,
  robo: RoboConfig,
  p: PedidoDoCiclo,
): Promise<ResultadoAnalise> {
  const analiseId = await iniciarAnalise(deps, robo);
  const resultado = await pedirAoAgente(deps, robo, p, analiseId);
  await concluirAnalise(deps, robo, analiseId, resultado);
  return resultado;
}

/** Falha não é engolida: vira resultado com o motivo. */
async function pedirAoAgente(
  deps: Dependencias,
  robo: RoboConfig,
  p: PedidoDoCiclo,
  analiseId: string,
): Promise<ResultadoAnalise> {
  try {
    const orc = await orcamento(deps, robo, p);
    const resposta = await deps.agente.analisar({
      robo: { id: robo.id, simbolo: robo.simbolo, intervalo: robo.intervalo },
      sinal: p.sinal,
      preco: p.preco,
      fechamentos: p.fechamentos,
      posicao: p.posicao,
      usuarioId: robo.usuarioId,
      analiseId,
      ...(orc ? { orcamento: orc } : {}),
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
