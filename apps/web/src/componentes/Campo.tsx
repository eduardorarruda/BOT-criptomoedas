import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";

/** Campos com rótulo, dica e erro ligados por aria-describedby. */
interface Base {
  readonly rotulo: string;
  readonly dica?: ReactNode;
  readonly erro?: string | null | undefined;
}

function useDescricao(dica: ReactNode, erro: string | null | undefined) {
  const id = useId();
  const idDica = dica ? `${id}-dica` : undefined;
  const idErro = erro ? `${id}-erro` : undefined;
  const descricao = [idDica, idErro].filter(Boolean).join(" ") || undefined;
  return { id, idDica, idErro, descricao };
}

function Rodape({
  dica,
  erro,
  idDica,
  idErro,
}: {
  dica: ReactNode;
  erro?: string | null | undefined;
  idDica?: string | undefined;
  idErro?: string | undefined;
}) {
  return (
    <>
      {dica ? (
        <span id={idDica} className="campo__dica">
          {dica}
        </span>
      ) : null}
      {erro ? (
        <span id={idErro} className="campo__erro" role="alert">
          {erro}
        </span>
      ) : null}
    </>
  );
}

export function CampoTexto({
  rotulo,
  dica,
  erro,
  className = "",
  ...input
}: Base & InputHTMLAttributes<HTMLInputElement>) {
  const { id, idDica, idErro, descricao } = useDescricao(dica, erro);
  return (
    <div className={`campo ${className}`}>
      <label htmlFor={id} className="campo__rotulo">
        {rotulo}
      </label>
      <input
        id={id}
        className="campo__entrada"
        aria-invalid={erro ? true : undefined}
        aria-describedby={descricao}
        {...input}
      />
      <Rodape dica={dica} erro={erro} idDica={idDica} idErro={idErro} />
    </div>
  );
}

export function CampoSelecao({
  rotulo,
  dica,
  erro,
  className = "",
  children,
  ...select
}: Base & SelectHTMLAttributes<HTMLSelectElement>) {
  const { id, idDica, idErro, descricao } = useDescricao(dica, erro);
  return (
    <div className={`campo ${className}`}>
      <label htmlFor={id} className="campo__rotulo">
        {rotulo}
      </label>
      <select
        id={id}
        className="campo__entrada campo__selecao"
        aria-invalid={erro ? true : undefined}
        aria-describedby={descricao}
        {...select}
      >
        {children}
      </select>
      <Rodape dica={dica} erro={erro} idDica={idDica} idErro={idErro} />
    </div>
  );
}
