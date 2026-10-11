import type { LucideIcon } from "lucide-react";
import { createContext, useContext, type ReactNode } from "react";

/**
 * Grupo do menu da página aberta ("Construir", "Proteger"…). A casca fornece; o
 * cabeçalho mostra como sobretítulo, para a pessoa saber onde está. Fora da casca
 * (testes, telas soltas) fica vazio e nada aparece.
 */
export const ContextoSecao = createContext<string | undefined>(undefined);

/**
 * Cabeçalho de página: sobretítulo (grupo do menu), título em Instrument Serif, uma
 * frase do que é a tela, ações à direita e, se houver, uma faixa de abas embaixo.
 * `meta` é uma linha curta de contexto (estado da conexão, contagem, última atualização).
 */
export function Cabecalho({
  titulo,
  children,
  acoes,
  sobretitulo,
  meta,
  abas,
}: {
  readonly titulo: string;
  readonly children?: ReactNode;
  readonly acoes?: ReactNode;
  /** Texto acima do título. Sem ele, vale o grupo do menu; `null` esconde. */
  readonly sobretitulo?: ReactNode;
  readonly meta?: ReactNode;
  readonly abas?: ReactNode;
}) {
  const secao = useContext(ContextoSecao);
  const acima = sobretitulo === undefined ? secao : sobretitulo;
  return (
    <header className={`cabecalho ${abas ? "cabecalho--com-abas" : ""}`}>
      <div className="cabecalho__linha">
        <div className="cabecalho__texto">
          {acima ? <p className="cabecalho__sobretitulo rotulo-caixa">{acima}</p> : null}
          <h1 className="cabecalho__titulo titulo-serif">{titulo}</h1>
          {children ? <p className="cabecalho__descricao">{children}</p> : null}
          {meta ? <div className="cabecalho__meta">{meta}</div> : null}
        </div>
        {acoes ? <div className="cabecalho__acoes">{acoes}</div> : null}
      </div>
      {abas ? <div className="cabecalho__abas">{abas}</div> : null}
    </header>
  );
}

export type VariantePainel = "padrao" | "destaque" | "plano" | "atencao" | "perigo";

/**
 * Seção com título. Borda só quando o conteúdo é um grupo que se lê junto.
 * - `variante="destaque"`: um pouco mais de relevo (o bloco principal da tela).
 * - `variante="plano"` (ou `semBorda`): sem moldura, só o título e o conteúdo.
 * - `variante="atencao" | "perigo"`: borda e fundo no tom, para avisos que pedem ação.
 */
export function Painel({
  titulo,
  children,
  acoes,
  className = "",
  semBorda = false,
  id,
  descricao,
  icone: Icone,
  variante = "padrao",
}: {
  readonly titulo?: string;
  readonly children: ReactNode;
  readonly acoes?: ReactNode;
  readonly className?: string;
  readonly semBorda?: boolean;
  readonly id?: string;
  readonly descricao?: ReactNode;
  readonly icone?: LucideIcon;
  readonly variante?: VariantePainel;
}) {
  const tipo = semBorda ? "plano" : variante;
  const classes = ["painel", tipo === "plano" ? "painel--aberto" : "", `painel--${tipo}`, className]
    .filter(Boolean)
    .join(" ");
  return (
    <section className={classes} aria-labelledby={titulo && id ? id : undefined}>
      {titulo || acoes ? (
        <div className="painel__topo">
          {titulo ? (
            <div className="painel__cabeca">
              {Icone ? (
                <span className="painel__icone" aria-hidden="true">
                  <Icone size={16} strokeWidth={1.8} />
                </span>
              ) : null}
              <div className="painel__textos">
                <h2 className="painel__titulo" id={id}>
                  {titulo}
                </h2>
                {descricao ? <p className="painel__descricao">{descricao}</p> : null}
              </div>
            </div>
          ) : null}
          {acoes ? <div className="painel__acoes">{acoes}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}
