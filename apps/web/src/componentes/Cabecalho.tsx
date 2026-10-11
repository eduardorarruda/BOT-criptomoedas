import type { ReactNode } from "react";

/** Cabeçalho de página: título em Instrument Serif, uma frase do que é a tela, e ações. */
export function Cabecalho({
  titulo,
  children,
  acoes,
}: {
  readonly titulo: string;
  readonly children?: ReactNode;
  readonly acoes?: ReactNode;
}) {
  return (
    <header className="cabecalho">
      <div className="cabecalho__texto">
        <h1 className="cabecalho__titulo titulo-serif">{titulo}</h1>
        {children ? <p className="cabecalho__descricao">{children}</p> : null}
      </div>
      {acoes ? <div className="cabecalho__acoes">{acoes}</div> : null}
    </header>
  );
}

/** Seção com título. Borda só quando o conteúdo é um grupo que se lê junto. */
export function Painel({
  titulo,
  children,
  acoes,
  className = "",
  semBorda = false,
  id,
}: {
  readonly titulo?: string;
  readonly children: ReactNode;
  readonly acoes?: ReactNode;
  readonly className?: string;
  readonly semBorda?: boolean;
  readonly id?: string;
}) {
  return (
    <section
      className={`painel ${semBorda ? "painel--aberto" : ""} ${className}`}
      aria-labelledby={titulo && id ? id : undefined}
    >
      {titulo || acoes ? (
        <div className="painel__topo">
          {titulo ? (
            <h2 className="painel__titulo" id={id}>
              {titulo}
            </h2>
          ) : null}
          {acoes ? <div className="painel__acoes">{acoes}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}
