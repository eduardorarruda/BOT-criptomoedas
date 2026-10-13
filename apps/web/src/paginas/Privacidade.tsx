import { Link } from "@tanstack/react-router";
import { ArrowLeft, Printer } from "lucide-react";
import { useEffect } from "react";
import { Marca } from "../componentes/Marca";
import { opcoesDoBuild } from "../layout/CabecaDaRota";
import { LICENCA_LINK, TextoAvisoRisco } from "../layout/RodapeLegal";
import { jsonParaScript, urlCanonica } from "../lib/cabeca";
import { ConteudoPrivacidade } from "./privacidade/ConteudoPrivacidade";
import { ATUALIZADA_EM, dadosEstruturadosPrivacidade, SECOES } from "./privacidade/dados";
import "../estilos/legal.css";

export const ID_DADOS_PRIVACIDADE = "dados-estruturados-privacidade";

/** Põe o JSON-LD da página no <head> enquanto ela estiver aberta. */
function useDadosEstruturados(): void {
  useEffect(() => {
    const el = document.createElement("script");
    el.type = "application/ld+json";
    el.id = ID_DADOS_PRIVACIDADE;
    el.textContent = jsonParaScript(
      dadosEstruturadosPrivacidade(urlCanonica(opcoesDoBuild(), "/privacidade")),
    );
    document.head.append(el);
    return () => el.remove();
  }, []);
}

/**
 * Política de privacidade (LGPD), pública: abre sem login, em qualquer instância.
 * Feita para ler e imprimir: sumário, seções curtas e o rodapé com o aviso de risco.
 */
export function Privacidade() {
  useDadosEstruturados();
  return (
    <div className="privacidade">
      <a className="pular-para-conteudo" href="#conteudo">
        Pular para o conteúdo
      </a>
      <header className="privacidade__topo">
        <Link to="/" className="privacidade__marca" aria-label="ZenTrade, voltar ao início">
          <Marca tamanho={26} />
        </Link>
        <div className="privacidade__acoes">
          <Link to="/" className="privacidade__voltar">
            <ArrowLeft size={16} aria-hidden="true" /> Voltar
          </Link>
          <button type="button" className="privacidade__imprimir" onClick={() => window.print()}>
            <Printer size={16} aria-hidden="true" /> Imprimir
          </button>
        </div>
      </header>

      <main id="conteudo" className="privacidade__conteudo" tabIndex={-1}>
        <article className="privacidade__artigo" aria-labelledby="titulo-privacidade">
          <h1 id="titulo-privacidade" className="privacidade__titulo titulo-serif">
            Política de privacidade
          </h1>
          <p className="privacidade__meta">
            Como o ZenTrade trata dados pessoais, pela LGPD (Lei nº 13.709/2018). Última atualização:{" "}
            {ATUALIZADA_EM}.
          </p>

          <nav className="privacidade__sumario" aria-labelledby="titulo-sumario">
            <h2 id="titulo-sumario" className="legal__titulo legal__titulo--2">
              Sumário
            </h2>
            <ol>
              {SECOES.map((s) => (
                <li key={s.id}>
                  <a href={`#${s.id}`}>{s.titulo}</a>
                </li>
              ))}
            </ol>
          </nav>

          <ConteudoPrivacidade nivel={2} />

          <aside className="privacidade__risco" aria-labelledby="titulo-risco">
            <h2 id="titulo-risco" className="legal__titulo legal__titulo--2">
              Aviso de risco
            </h2>
            <TextoAvisoRisco />
          </aside>
        </article>
      </main>

      <footer className="privacidade__rodape">
        <a href={LICENCA_LINK} target="_blank" rel="noopener noreferrer">
          Código aberto · AGPL-3.0<span className="so-leitor"> (abre em outra aba)</span>
        </a>
        <span>
          <span className="so-leitor">Versão </span>v{__ZENTRADE_VERSAO__}
        </span>
      </footer>
    </div>
  );
}
