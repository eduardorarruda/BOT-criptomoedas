import { useCallback, useMemo, useRef, useState, type Dispatch } from "react";
import type { NoEditor } from "./arvore";
import { Contexto, type Arrastando } from "./contexto";
import type { Acao } from "./estado";
import { NoVisual } from "./NoVisual";
import { Paleta } from "./Paleta";

/** Área de montagem: paleta de blocos + árvore, com avisos para leitor de tela. */
export function EditorRegras({
  raiz,
  despachar,
}: {
  readonly raiz: NoEditor;
  readonly despachar: Dispatch<Acao>;
}) {
  const [arrastando, setArrastando] = useState<Arrastando>(null);
  const [aviso, setAviso] = useState("");
  const caixa = useRef<HTMLDivElement>(null);

  const focar = useCallback((id: string) => {
    requestAnimationFrame(() =>
      caixa.current?.querySelector<HTMLElement>(`[data-no-id="${CSS.escape(id)}"]`)?.focus(),
    );
  }, []);

  const valor = useMemo(
    () => ({ raiz, despachar, arrastando, setArrastando, anunciar: setAviso, focar }),
    [raiz, despachar, arrastando, focar],
  );

  return (
    <Contexto.Provider value={valor}>
      <div className={`editor-regras ${arrastando ? "editor-regras--arrastando" : ""}`} ref={caixa}>
        <Paleta />
        <div className="arvore">
          <NoVisual no={raiz} ehRaiz />
        </div>
        <p className="so-leitor" aria-live="polite">
          {aviso}
        </p>
      </div>
    </Contexto.Provider>
  );
}
