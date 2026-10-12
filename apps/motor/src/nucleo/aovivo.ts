import type { EventoAnalise, ProtecaoCorretoraDTO, ProtecaoGravada, RoboConfig } from "@zentrade/contratos";
import { paraTexto, posicaoDe, type Candle, type Posicao, type Sinal, type Valor } from "@zentrade/dominio";
import { randomUUID } from "node:crypto";
import type { ResultadoAnalise } from "./analise.js";
import { publicar } from "./diario.js";
import type { Dependencias } from "./tipos.js";

/**
 * Tudo o que o robô faz vira evento para a tela "Ao vivo": candle fechado, sinal
 * avaliado (com a explicação da árvore), início e fim da análise do agente e a
 * posição depois de cada execução. Publicar nunca derruba o robô (ver `publicar`).
 */

/** Candle fechado do intervalo do robô (decimais em texto, como no contrato). */
export function publicarCandle(deps: Dependencias, robo: RoboConfig, c: Candle): Promise<void> {
  return publicar(deps, {
    tipo: "candle",
    roboId: robo.id,
    simbolo: robo.simbolo,
    intervalo: robo.intervalo,
    candle: {
      abertura: c.abertura,
      abre: paraTexto(c.abre),
      maxima: paraTexto(c.maxima),
      minima: paraTexto(c.minima),
      fecha: paraTexto(c.fecha),
      volume: paraTexto(c.volume),
    },
  });
}

/** O que a árvore de regras respondeu, com o porquê, no preço em que avaliou. */
export function publicarSinal(
  deps: Dependencias,
  robo: RoboConfig,
  sinal: Sinal,
  preco: Valor,
  em: number,
): Promise<void> {
  return publicar(deps, {
    tipo: "sinal",
    roboId: robo.id,
    acao: sinal.acao,
    explicacao: sinal.explicacao,
    preco: paraTexto(preco),
    em,
  });
}

/** A proteção no livro da corretora como a tela mostra ("Stop na corretora: ativo a X"). */
export function protecaoCorretoraDTO(p: ProtecaoGravada): ProtecaoCorretoraDTO {
  return {
    estado: p.estado,
    stop: paraTexto(p.stop),
    limite: paraTexto(p.limite),
    ...(p.alvo ? { alvo: paraTexto(p.alvo) } : {}),
    quantidade: paraTexto(p.quantidade),
    ...(p.motivo ? { motivo: p.motivo } : {}),
    atualizadaEm: p.atualizadaEm,
  };
}

export function eventoPosicao(robo: RoboConfig, p: Posicao, em: number, protecao?: ProtecaoGravada | null) {
  return {
    tipo: "posicao" as const,
    roboId: robo.id,
    simbolo: robo.simbolo,
    quantidade: paraTexto(p.quantidade),
    precoMedio: paraTexto(p.precoMedio),
    resultadoRealizado: paraTexto(p.resultadoRealizado),
    taxasPagas: paraTexto(p.taxasPagas),
    ...(protecao ? { protecaoCorretora: protecaoCorretoraDTO(protecao) } : {}),
    em,
  };
}

/**
 * Posição derivada das execuções (nunca gravada), publicada depois de cada execução e
 * de cada mudança da proteção na corretora (que vai junto).
 */
export async function publicarPosicao(deps: Dependencias, robo: RoboConfig): Promise<void> {
  try {
    const posicao = posicaoDe(await deps.ordens.execucoes(robo.id));
    const protecao = await deps.protecoes?.ultima(robo.id);
    await publicar(deps, eventoPosicao(robo, posicao, deps.relogio.agora(), protecao));
  } catch (erro) {
    deps.registro.error({ erro, roboId: robo.id }, "falha ao ler a posição para publicar");
  }
}

/** Cria o `analiseId` (vai no pedido ao agente) e avisa a tela que a análise começou. */
export async function iniciarAnalise(deps: Dependencias, robo: RoboConfig): Promise<string> {
  const analiseId = randomUUID();
  await publicar(deps, { tipo: "analise", analiseId, roboId: robo.id, concluida: false });
  return analiseId;
}

const resultadoDe = (r: ResultadoAnalise): NonNullable<EventoAnalise["resultado"]> =>
  r.tipo === "ok" ? r.resposta.proposta.acao : "falhou";

/** Fecha a análise: a ação proposta pelo agente, ou "falhou" (aí o motor não opera). */
export function concluirAnalise(
  deps: Dependencias,
  robo: RoboConfig,
  analiseId: string,
  r: ResultadoAnalise,
): Promise<void> {
  return publicar(deps, {
    tipo: "analise",
    analiseId,
    roboId: robo.id,
    concluida: true,
    resultado: resultadoDe(r),
  });
}
