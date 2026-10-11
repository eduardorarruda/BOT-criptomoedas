import type { Dependencias } from "./tipos.js";

export type FimAprovacao = "aprovada" | "recusada" | "expirada";

/**
 * Modo Sugerir: consulta o estado da decisão (a resposta da pessoa chega pela API)
 * até ser aprovada, recusada ou expirar. Expirou = não opera. Só devolve "expirada" para o chamador marcar quando ninguém respondeu a tempo.
 */
export async function aguardarAprovacao(
  deps: Dependencias,
  decisaoId: string,
  expiraEm: number,
): Promise<FimAprovacao> {
  for (;;) {
    const estado = await deps.decisoes.estado(decisaoId);
    if (estado === "aprovada" || estado === "recusada" || estado === "expirada") return estado;
    // Qualquer outro estado (ou a decisão sumiu): alguém já resolveu; não opera.
    if (estado !== "aguardando_aprovacao") return "recusada";
    if (deps.relogio.agora() >= expiraEm) return "expirada";
    await deps.dormir(deps.opcoes.consultaAprovacaoMs);
  }
}
