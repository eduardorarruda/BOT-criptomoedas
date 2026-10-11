import { Link } from "@tanstack/react-router";
import { useDecisoes } from "../ganchos/consultas";
import { NAVEGACAO } from "./navegacao";

/** Menu lateral. "Decisões" mostra quantas aguardam sua resposta. */
export function Navegacao({ aoNavegar }: { readonly aoNavegar?: () => void }) {
  const aguardando = useDecisoes({ estado: "aguardando_aprovacao" }).data?.length ?? 0;
  return (
    <nav className="navegacao" aria-label="Principal">
      {NAVEGACAO.map((grupo) => (
        <div key={grupo.titulo} className="navegacao__grupo">
          <p className="navegacao__titulo">{grupo.titulo}</p>
          <ul role="list">
            {grupo.itens.map(({ para, rotulo, icone: Icone }) => (
              <li key={para}>
                <Link
                  to={para}
                  className="navegacao__item"
                  activeOptions={{ exact: para === "/" }}
                  activeProps={{ "aria-current": "page", className: "navegacao__item--ativo" }}
                  onClick={aoNavegar}
                >
                  <Icone size={17} strokeWidth={1.8} aria-hidden="true" />
                  <span>{rotulo}</span>
                  {para === "/decisoes" && aguardando > 0 ? (
                    <span
                      className="navegacao__contador num"
                      aria-label={`${aguardando} aguardando sua resposta`}
                    >
                      {aguardando}
                    </span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}
