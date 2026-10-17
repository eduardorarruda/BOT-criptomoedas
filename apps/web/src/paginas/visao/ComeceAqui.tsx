import { Link } from "@tanstack/react-router";
import { ArrowRight, Check, ChevronDown, EyeOff, Server } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { useAvisos } from "../../componentes/Avisos";
import type { Passo } from "../../lib/primeirosPassos";
import { useComeceAqui } from "./useComeceAqui";

function LinhaPasso({ passo, numero, proximo }: { passo: Passo; numero: number; proximo: boolean }) {
  const estado = passo.feito ? "feito" : proximo ? "proximo" : "falta";
  return (
    <li className={`comece__passo comece__passo--${estado}`}>
      <span className="comece__marca" aria-hidden="true">
        {passo.feito ? <Check size={14} strokeWidth={2.6} /> : numero}
      </span>
      <div className="comece__textos">
        <p className="comece__passo-titulo">
          {passo.titulo}
          <span className="so-leitor">
            {passo.feito ? " (feito)" : proximo ? " (próximo passo)" : " (falta)"}
          </span>
        </p>
        {passo.feito ? null : <p className="comece__passo-descricao">{passo.descricao}</p>}
      </div>
      {passo.feito ? (
        <span className="comece__feito" aria-hidden="true">
          Feito
        </span>
      ) : proximo ? (
        <Link to={passo.para} className="botao botao--primario botao--pequeno comece__acao">
          {passo.acao}
          <ArrowRight size={14} aria-hidden="true" />
        </Link>
      ) : (
        <Link
          to={passo.para}
          className="link-seta comece__acao"
          aria-label={`${passo.acao}: ${passo.titulo}`}
        >
          Abrir <ArrowRight size={14} aria-hidden="true" />
        </Link>
      )}
    </li>
  );
}

/**
 * "Comece aqui": os primeiros passos de uma instalação nova, do mais seguro ao mais
 * arriscado (proteger a conta, testar no passado, operar no papel). O progresso vem dos
 * dados; some quando tudo está feito, ou quando a pessoa oculta (com Desfazer).
 */
export function ComeceAqui() {
  const { resultado, oculto, ocultar, mostrar } = useComeceAqui();
  const avisar = useAvisos();
  const idLista = useId();
  const idAlternar = useId();
  // O botão troca de lugar entre a linha compacta e a lista aberta: o foco vai junto.
  const alternarFoco = useRef(false);
  useEffect(() => {
    if (!alternarFoco.current) return;
    alternarFoco.current = false;
    document.getElementById(idAlternar)?.focus();
  });
  // Com mais da metade feita, a lista recolhe: fica só o próximo passo (dá para abrir).
  const [escolhaAberta, setAberta] = useState<boolean | null>(null);
  if (!resultado || resultado.completo || oculto) return null;
  const { passos, feitos, total, proximo, operador } = resultado;
  const aberta = escolhaAberta ?? feitos < total / 2;

  const progresso = (
    <div className="comece__progresso">
      <span className="num comece__contagem">
        {feitos} de {total}
      </span>
      <span
        className="comece__barra"
        role="progressbar"
        aria-label="Primeiros passos feitos"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={feitos}
        aria-valuetext={`${feitos} de ${total} passos feitos`}
      >
        <span className="comece__barra-cheia" style={{ width: `${(feitos / total) * 100}%` }} />
      </span>
    </div>
  );
  const botaoOcultar = (
    <button
      type="button"
      className="botao botao--fantasma botao--pequeno"
      onClick={() => {
        ocultar();
        avisar(
          "info",
          "Primeiros passos ocultos. A paleta de comandos (Ir para…, ou a tecla /) traz de volta.",
          {
            rotulo: "Desfazer",
            executar: mostrar,
          },
        );
      }}
    >
      <EyeOff size={14} aria-hidden="true" />
      Ocultar
    </button>
  );
  const alternar =
    feitos >= total / 2 ? (
      <button
        type="button"
        className="comece__alternar"
        aria-expanded={aberta}
        id={idAlternar}
        aria-controls={aberta ? idLista : undefined}
        onClick={() => {
          alternarFoco.current = true;
          setAberta(!aberta);
        }}
      >
        <ChevronDown size={14} aria-hidden="true" />
        {aberta ? "Esconder os passos" : "Ver os passos"}
      </button>
    ) : null;

  if (!aberta)
    return (
      <section className="comece comece--compacto" aria-labelledby="titulo-comece">
        <div className="comece__compacto-cabeca">
          <h2 id="titulo-comece" className="comece__titulo-compacto">
            Primeiros passos
          </h2>
          {progresso}
        </div>
        <p className="comece__passo-titulo comece__compacto-proximo">
          <span className="apagado">Próximo:</span> {proximo?.titulo}
        </p>
        <div className="comece__compacto-acoes">
          {proximo ? (
            <Link to={proximo.para} className="botao botao--primario botao--pequeno comece__acao">
              {proximo.acao}
              <ArrowRight size={14} aria-hidden="true" />
            </Link>
          ) : null}
          {alternar}
          {botaoOcultar}
        </div>
      </section>
    );

  return (
    <section className="comece" aria-labelledby="titulo-comece">
      <header className="comece__topo">
        <div className="comece__cabeca">
          <p className="rotulo-caixa comece__sobretitulo">Comece aqui</p>
          <h2 id="titulo-comece" className="comece__titulo titulo-serif">
            Primeiros passos
          </h2>
          <p className="comece__descricao">
            Primeiro proteger a conta, depois testar no passado e no papel. Nenhum destes passos usa dinheiro
            real.
          </p>
        </div>
        <div className="comece__lado">
          {progresso}
          {botaoOcultar}
        </div>
      </header>
      <ol className="comece__lista" role="list" id={idLista}>
        {passos.map((p, i) => (
          <LinhaPasso key={p.id} passo={p} numero={i + 1} proximo={p.id === proximo?.id} />
        ))}
      </ol>
      {alternar}
      {operador && !operador.feito ? (
        <div className="comece__operador">
          <Server size={16} aria-hidden="true" />
          <div>
            <p className="comece__passo-titulo">{operador.titulo}</p>
            <p className="comece__passo-descricao">
              Para quem opera esta instância: <code>ZENTRADE_CONTROLADOR_NOME</code> e{" "}
              <code>ZENTRADE_CONTROLADOR_EMAIL</code> no ambiente da API. A política de privacidade mostra
              esse contato.
            </p>
          </div>
          <Link to={operador.para} className="link-seta comece__acao">
            {operador.acao} <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </div>
      ) : null}
    </section>
  );
}
