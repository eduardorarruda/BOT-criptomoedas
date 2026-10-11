import type { RoboConfig } from "@zentrade/contratos";
import type { Posicao } from "@zentrade/dominio";
import { mudarEstado } from "./diario.js";
import { exposicao, montarEstadoRisco } from "./estado-risco.js";
import { executarDecisao } from "./execucao.js";
import { avaliar, type Plano } from "./plano.js";
import { quantidadeVenda } from "./protecao.js";
import type { AprovacaoPendente, Dependencias, ResultadoCiclo } from "./tipos.js";

export type FimAprovacao = "aprovada" | "recusada" | "expirada";

/**
 * Modo Sugerir: consulta o estado da decisão (a resposta da pessoa chega pela API e
 * muda o estado no banco) até ser aprovada, recusada ou expirar. Roda FORA da trava
 * do robô: enquanto espera, os candles de 1 min seguem vigiando o stop. `null` quando
 * `ativa()` deixou de valer (o robô está parando).
 */
export async function vigiarAprovacao(
  deps: Dependencias,
  decisaoId: string,
  expiraEm: number,
  ativa: () => boolean,
): Promise<FimAprovacao | null> {
  for (;;) {
    if (!ativa()) return null;
    const estado = await lerEstado(deps, decisaoId);
    if (estado === "aprovada" || estado === "recusada" || estado === "expirada") return estado;
    // Qualquer outro estado (ou a decisão sumiu): alguém já resolveu; não opera.
    if (estado !== "aguardando_aprovacao" && estado !== "indisponivel") return "recusada";
    if (deps.relogio.agora() >= expiraEm) return "expirada";
    await deps.dormir(deps.opcoes.consultaAprovacaoMs);
  }
}

/** Banco fora do ar não encerra a espera: tenta de novo até o prazo. */
async function lerEstado(deps: Dependencias, decisaoId: string) {
  try {
    return await deps.decisoes.estado(decisaoId);
  } catch (erro) {
    deps.registro.warn({ erro, decisaoId }, "não deu para ler o estado da aprovação; tentando de novo");
    return "indisponivel" as const;
  }
}

const POSICAO_ZERADA = {
  codigo: "posicao_zerada",
  mensagem: "A posição já foi fechada (stop ou fora do robô) enquanto a venda esperava aprovação.",
};

/** A venda aprovada vende a posição de agora, não a de quando foi sugerida. */
async function replanejar(
  deps: Dependencias,
  robo: RoboConfig,
  plano: Plano,
  posicao: Posicao,
): Promise<Plano> {
  if (plano.lado === "COMPRA") return plano;
  const filtros = await deps.corretora.filtros(robo.simbolo);
  return { ...plano, quantidade: quantidadeVenda(posicao.quantidade, filtros) };
}

/** Marca a decisão pendente como barrada (com o motivo) e publica. */
export async function barrarPendente(
  deps: Dependencias,
  p: AprovacaoPendente,
  barreira: { codigo: string; mensagem: string },
): Promise<ResultadoCiclo> {
  await mudarEstado(deps, p.registrada, "barrada", { risco: { aprovada: false, barreiras: [barreira] } });
  return { estado: "barrada", plano: p.plano };
}

export const barrarPorPosicaoZerada = (deps: Dependencias, p: AprovacaoPendente) =>
  barrarPendente(deps, p, POSICAO_ZERADA);

/**
 * Depois da resposta: expirou ou recusou, não opera. Aprovada: o risco é reavaliado
 * com o estado de agora (pode ter havido parada total) antes de enviar.
 */
export async function concluirAprovacao(
  deps: Dependencias,
  robo: RoboConfig,
  p: AprovacaoPendente,
  fim: FimAprovacao,
  posicao: Posicao,
): Promise<ResultadoCiclo> {
  if (fim === "expirada") {
    await mudarEstado(deps, p.registrada, "expirada");
    return { estado: "expirada", plano: p.plano };
  }
  if (fim === "recusada")
    return { estado: (await deps.decisoes.estado(p.registrada.id)) ?? "recusada", plano: p.plano };
  const plano = await replanejar(deps, robo, p.plano, posicao);
  if (plano.lado === "VENDA" && plano.quantidade.isZero()) return barrarPorPosicaoZerada(deps, p);
  const preco = p.entrada.preco;
  const filtros = await deps.corretora.filtros(robo.simbolo);
  const estado = await montarEstadoRisco(deps, robo.id, exposicao(posicao, preco));
  const risco = avaliar(robo, plano, preco, estado, filtros);
  if (!risco.aprovada) {
    await mudarEstado(deps, p.registrada, "barrada", { risco });
    return { estado: "barrada", plano };
  }
  return executarDecisao(deps, robo, p.registrada, plano);
}
