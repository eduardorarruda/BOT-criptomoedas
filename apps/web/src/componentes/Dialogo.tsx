import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";

/**
 * Diálogo modal com o <dialog> nativo: prende o foco, fecha no Esc e devolve o
 * foco a quem abriu. O conteúdo só é montado enquanto está aberto.
 */
interface Props {
  readonly aberto: boolean;
  readonly aoFechar: () => void;
  readonly titulo: string;
  readonly descricao?: ReactNode;
  readonly children: ReactNode;
  readonly largo?: boolean;
}

export function Dialogo({ aberto, aoFechar, titulo, descricao, children, largo = false }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const idTitulo = useId();
  const idDescricao = useId();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (aberto && !el.open) el.showModal();
    if (!aberto && el.open) el.close();
  }, [aberto]);

  return (
    // eslint-disable-next-line jsx-a11y-x/click-events-have-key-events, jsx-a11y-x/no-noninteractive-element-interactions -- clicar no fundo fecha; pelo teclado, Esc fecha (onCancel)
    <dialog
      ref={ref}
      className={`dialogo ${largo ? "dialogo--largo" : ""}`}
      aria-labelledby={idTitulo}
      aria-describedby={descricao ? idDescricao : undefined}
      onCancel={(e) => {
        e.preventDefault();
        aoFechar();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) aoFechar();
      }}
    >
      {aberto ? (
        <div className="dialogo__corpo">
          <header className="dialogo__cabecalho">
            <h2 id={idTitulo} className="dialogo__titulo titulo-serif">
              {titulo}
            </h2>
            <button type="button" className="botao-icone" onClick={aoFechar} aria-label="Fechar">
              <X size={18} aria-hidden="true" />
            </button>
          </header>
          {descricao ? (
            <p id={idDescricao} className="dialogo__descricao">
              {descricao}
            </p>
          ) : null}
          {children}
        </div>
      ) : null}
    </dialog>
  );
}
