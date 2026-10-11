import { Link } from "@tanstack/react-router";
import { useDecisoes } from "../ganchos/consultas";
import { NAVEGACAO } from "./navegacao";

/**
 * Menu lateral. "Decisões" mostra quantas aguardam sua resposta. Recolhido (só
 * ícones), o texto de cada item continua lá para o leitor de tela e vira dica ao
 * passar o mouse; o contador vira um ponto sobre o ícone.
 */
export function Navegacao({
  aoNavegar,
  recolhida = false,
}: {
  readonly aoNavegar?: () => void;
  readonly recolhida?: boolean;
}) {
  const aguardando = useDecisoes({ estado: "aguardando_aprovacao" }).data?.length ?? 0;
  return (
    <nav className={`navegacao ${recolhida ? "navegacao--recolhida" : ""}`} aria-label="Principal">
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
                  title={recolhida ? rotulo : undefined}
                >
                  <span className="navegacao__icone">
                    <Icone size={17} strokeWidth={1.8} aria-hidden="true" />
                    {recolhida && para === "/decisoes" && aguardando > 0 ? (
                      <span className="navegacao__ponto" aria-hidden="true" />
                    ) : null}
                  </span>
                  <span className="navegacao__rotulo">{rotulo}</span>
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
