import type { RegistroAoVivo } from "../../api/esquemas";
import { descrever } from "../../lib/aovivo/descrever";

/** Só o que muda dinheiro ou bloqueia é anunciado; candles e etapas não (seria ruído). */
const ANUNCIAR = new Set(["ordem", "risco", "posicao"]);

/** Região viva para leitor de tela: a última ordem, barreira ou mudança de posição. */
export function AnuncioAoVivo({ registros }: { readonly registros: readonly RegistroAoVivo[] }) {
  const ultimo = registros.findLast((r) => ANUNCIAR.has(r.evento.tipo));
  const d = ultimo ? descrever(ultimo.evento) : null;
  return (
    <p className="so-leitor" aria-live="polite" aria-atomic="true">
      {d ? `${d.titulo}. ${d.detalhe ?? ""}` : ""}
    </p>
  );
}
