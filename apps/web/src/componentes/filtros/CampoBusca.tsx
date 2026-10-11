import { Search, X } from "lucide-react";
import { useEffect, useId, useState } from "react";

const ESPERA_MS = 250;

/**
 * Busca por texto que espera a pessoa parar de digitar antes de mexer na URL
 * (uma entrada do histórico por busca, não por letra). Esc limpa.
 */
export function CampoBusca({
  valor,
  aoMudar,
  rotulo,
  sugestao,
}: {
  readonly valor: string | undefined;
  readonly aoMudar: (v: string | undefined) => void;
  readonly rotulo: string;
  readonly sugestao: string;
}) {
  const id = useId();
  const [texto, setTexto] = useState(valor ?? "");
  const [externo, setExterno] = useState(valor);
  // A URL mudou por fora (limpar, voltar, visão salva): o campo acompanha. Se a pessoa
  // está no meio da digitação (texto ainda não enviado), só um "limpar" explícito apaga.
  if (valor !== externo) {
    const digitando = (texto.trim() || undefined) !== externo;
    setExterno(valor);
    if (!digitando || valor === undefined) setTexto(valor ?? "");
  }

  useEffect(() => {
    const novo = texto.trim() || undefined;
    if (novo === (valor ?? undefined)) return;
    const t = setTimeout(() => aoMudar(novo), ESPERA_MS);
    return () => clearTimeout(t);
  }, [texto, valor, aoMudar]);

  return (
    <div className="filtro-busca">
      <label htmlFor={id} className="so-leitor">
        {rotulo}
      </label>
      <Search size={16} aria-hidden="true" className="filtro-busca__icone" />
      <input
        id={id}
        type="search"
        className="filtro-busca__entrada"
        placeholder={sugestao}
        value={texto}
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && texto) {
            e.preventDefault();
            setTexto("");
          }
        }}
      />
      {texto ? (
        <button
          type="button"
          className="filtro-busca__limpar"
          aria-label="Apagar a busca"
          onClick={() => setTexto("")}
        >
          <X size={14} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
