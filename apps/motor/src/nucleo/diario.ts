import type { DecisaoDTO, EstadoDecisao, Evento, NovaDecisao } from "@zentrade/contratos";
import { paraTexto } from "@zentrade/dominio";
import type { Dependencias } from "./tipos.js";

export interface DecisaoRegistrada {
  readonly id: string;
  readonly decisao: NovaDecisao;
  readonly ordemId?: string;
}

/** Publica sem derrubar o robô; a falha vai para o registro, nunca some. */
export async function publicar(deps: Dependencias, evento: Evento): Promise<void> {
  try {
    await deps.eventos.publicar(evento);
  } catch (erro) {
    deps.registro.error({ erro, tipo: evento.tipo }, "falha ao publicar evento");
  }
}

export function decisaoDTO(r: DecisaoRegistrada): DecisaoDTO {
  const d = r.decisao;
  return {
    id: r.id,
    roboId: d.roboId,
    em: d.em,
    sinal: { acao: d.sinal.acao, explicacao: d.sinal.explicacao },
    preco: paraTexto(d.preco),
    risco: { aprovada: d.risco.aprovada, barreiras: d.risco.barreiras.map((b) => ({ ...b })) },
    estado: d.estado,
    ...(d.regime ? { regime: d.regime } : {}),
    ...(d.condicoes ? { condicoes: d.condicoes } : {}),
    ...(d.proposta ? { proposta: d.proposta } : {}),
    ...(d.quantidade ? { quantidade: paraTexto(d.quantidade) } : {}),
    ...(d.custoIaUsd ? { custoIaUsd: paraTexto(d.custoIaUsd) } : {}),
    ...(r.ordemId ? { ordemId: r.ordemId } : {}),
  };
}

/** Grava a decisão e avisa a tela. Barreiras do risco também viram eventos próprios. */
export async function registrarDecisao(deps: Dependencias, decisao: NovaDecisao): Promise<DecisaoRegistrada> {
  const id = await deps.decisoes.registrar(decisao);
  const registrada = { id, decisao };
  await publicar(deps, { tipo: "decisao", decisao: decisaoDTO(registrada) });
  for (const barreira of decisao.risco.barreiras)
    await publicar(deps, {
      tipo: "risco",
      roboId: decisao.roboId,
      barreira: { ...barreira },
      em: decisao.em,
    });
  return registrada;
}

export async function mudarEstado(
  deps: Dependencias,
  r: DecisaoRegistrada,
  estado: EstadoDecisao,
  extra: Partial<Pick<DecisaoRegistrada, "ordemId">> & Partial<Pick<NovaDecisao, "risco">> = {},
): Promise<DecisaoRegistrada> {
  await deps.decisoes.mudarEstado(r.id, estado);
  const nova: DecisaoRegistrada = {
    ...r,
    ...(extra.ordemId ? { ordemId: extra.ordemId } : {}),
    decisao: { ...r.decisao, estado, ...(extra.risco ? { risco: extra.risco } : {}) },
  };
  await publicar(deps, { tipo: "decisao", decisao: decisaoDTO(nova) });
  for (const barreira of extra.risco?.barreiras ?? [])
    await publicar(deps, {
      tipo: "risco",
      roboId: r.decisao.roboId,
      barreira: { ...barreira },
      em: deps.relogio.agora(),
    });
  return nova;
}
