import { Link } from "@tanstack/react-router";
import { lazy, Suspense, useRef, useState } from "react";
import { Dialogo } from "../componentes/Dialogo";
import { REPOSITORIO } from "../lib/cabeca";
import "../estilos/legal.css";

/** A política só é baixada quando alguém abre: o login continua leve. */
const ConteudoPrivacidade = lazy(() =>
  import("../paginas/privacidade/ConteudoPrivacidade").then((m) => ({ default: m.ConteudoPrivacidade })),
);

export const LICENCA_LINK = `${REPOSITORIO}/blob/main/LICENSE`;

/** O aviso de risco do projeto, o mesmo do login e do README. */
export function TextoAvisoRisco() {
  return (
    <div className="legal__texto">
      <p>
        O ZenTrade é um <strong>software de apoio à decisão</strong>. Operar criptomoedas envolve risco de
        perda, inclusive total. Nada aqui é recomendação de investimento nem promessa de lucro.
      </p>
      <p>
        Resultado passado, inclusive de backtest, não garante resultado futuro. Comece em papel ou na testnet,
        use só o dinheiro que pode perder e mantenha a parada total ao alcance.
      </p>
    </div>
  );
}

type Aberto = "privacidade" | "risco" | null;

/**
 * Rodapé discreto com o que é legal: política de privacidade e aviso de risco (em
 * diálogo, sem sair da tela), a licença e a versão. Fica no login e na casca.
 */
export function RodapeLegal({ className = "" }: { readonly className?: string }) {
  const [aberto, setAberto] = useState<Aberto>(null);
  const quemAbriu = useRef<HTMLButtonElement | null>(null);

  const abrir = (qual: Exclude<Aberto, null>, botao: HTMLButtonElement): void => {
    quemAbriu.current = botao;
    setAberto(qual);
  };
  const fechar = (): void => {
    setAberto(null);
    // O <dialog> nativo devolve o foco; aqui garantimos também onde ele não devolve.
    queueMicrotask(() => quemAbriu.current?.focus());
  };

  return (
    <footer className={`rodape-legal ${className}`}>
      <ul className="rodape-legal__lista" role="list">
        <li>
          <button
            type="button"
            className="rodape-legal__link"
            aria-haspopup="dialog"
            onClick={(e) => abrir("privacidade", e.currentTarget)}
          >
            Política de privacidade
          </button>
        </li>
        <li>
          <button
            type="button"
            className="rodape-legal__link"
            aria-haspopup="dialog"
            onClick={(e) => abrir("risco", e.currentTarget)}
          >
            Aviso de risco
          </button>
        </li>
        <li>
          <a className="rodape-legal__link" href={LICENCA_LINK} target="_blank" rel="noopener noreferrer">
            Código aberto · AGPL-3.0<span className="so-leitor"> (abre em outra aba)</span>
          </a>
        </li>
        <li className="rodape-legal__versao">
          <span className="so-leitor">Versão </span>v{__ZENTRADE_VERSAO__}
        </li>
      </ul>

      <Dialogo aberto={aberto === "privacidade"} aoFechar={fechar} titulo="Política de privacidade" largo>
        <Suspense fallback={<p className="legal__carregando">Carregando a política…</p>}>
          <ConteudoPrivacidade nivel={3} />
        </Suspense>
        <p className="legal__rodape-dialogo">
          <Link to="/privacidade" className="rodape-legal__link">
            Abrir em página própria (para imprimir ou guardar o link)
          </Link>
        </p>
      </Dialogo>

      <Dialogo aberto={aberto === "risco"} aoFechar={fechar} titulo="Aviso de risco">
        <TextoAvisoRisco />
      </Dialogo>
    </footer>
  );
}
