import { ChevronLeft, ChevronRight } from "lucide-react";

/** Anterior / próxima com a posição em texto. Some quando cabe tudo numa página. */
export function Paginacao({
  pagina,
  paginas,
  total,
  porPagina,
  aoMudar,
  rotulo = "Páginas",
}: {
  readonly pagina: number;
  readonly paginas: number;
  readonly total: number;
  readonly porPagina: number;
  readonly aoMudar: (p: number) => void;
  readonly rotulo?: string;
}) {
  if (paginas <= 1) return null;
  const de = (pagina - 1) * porPagina + 1;
  const ate = Math.min(total, pagina * porPagina);
  return (
    <nav className="paginacao" aria-label={rotulo}>
      <button
        type="button"
        className="ferramenta-botao"
        onClick={() => aoMudar(pagina - 1)}
        disabled={pagina <= 1}
      >
        <ChevronLeft size={16} aria-hidden="true" />
        Anterior
      </button>
      <p className="paginacao__posicao">
        <span className="num">
          {de}–{ate}
        </span>{" "}
        de <span className="num">{total}</span>
        <span className="apagado">
          {" "}
          · página {pagina} de {paginas}
        </span>
      </p>
      <button
        type="button"
        className="ferramenta-botao"
        onClick={() => aoMudar(pagina + 1)}
        disabled={pagina >= paginas}
      >
        Próxima
        <ChevronRight size={16} aria-hidden="true" />
      </button>
    </nav>
  );
}
