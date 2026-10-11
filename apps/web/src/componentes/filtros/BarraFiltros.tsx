import { ChevronDown, FilterX, SlidersHorizontal } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { Botao } from "../Botao";
import { Dialogo } from "../Dialogo";
import { CampoBusca } from "./CampoBusca";
import { useTelaCompacta } from "./useTelaCompacta";
import "./filtros.css";

export interface BuscaDaBarra {
  readonly valor: string | undefined;
  readonly aoMudar: (v: string | undefined) => void;
  /** Para o leitor de tela: "Buscar títulos". */
  readonly rotulo: string;
  /** O que se pode digitar: "nome, emissor…". */
  readonly sugestao: string;
}

/**
 * Barra de filtros de uma tela de dados: busca, ferramentas de visão (ordem, visão,
 * densidade) sempre à mão e os grupos de filtro. No celular os grupos vão para uma
 * folha aberta por um botão que mostra quantos filtros estão valendo.
 */
export function BarraFiltros({
  rotulo,
  busca,
  ferramentas,
  ativos,
  aoLimpar,
  resumo,
  extra,
  children,
  maisFiltros,
  maisAtivos = 0,
}: {
  readonly rotulo: string;
  readonly busca?: BuscaDaBarra;
  readonly ferramentas?: ReactNode;
  readonly ativos: number;
  readonly aoLimpar: () => void;
  /** "8 de 12 títulos": dito ao leitor de tela quando muda. */
  readonly resumo?: ReactNode;
  /** Ao lado do resumo (ex.: visões salvas). */
  readonly extra?: ReactNode;
  readonly children?: ReactNode;
  /** Filtros de uso menos frequente: ficam atrás de "Mais filtros" (abertos se algum estiver valendo). */
  readonly maisFiltros?: ReactNode;
  readonly maisAtivos?: number;
}) {
  const compacta = useTelaCompacta();
  const idMais = useId();
  const [folha, setFolha] = useState(false);
  const [mais, setMais] = useState(maisAtivos > 0);
  const temGrupos = Boolean(children) || Boolean(maisFiltros);
  return (
    <section className="filtros" aria-label={rotulo}>
      <div className="filtros__topo">
        {busca ? <CampoBusca {...busca} /> : null}
        {compacta && temGrupos ? (
          <button
            type="button"
            className="ferramenta-botao filtros__abrir"
            aria-haspopup="dialog"
            aria-label={ativos > 0 ? `Filtros, ${ativos} ativos` : "Filtros"}
            onClick={() => setFolha(true)}
          >
            <SlidersHorizontal size={16} aria-hidden="true" />
            Filtros
            {ativos > 0 ? (
              <span className="filtros__contador num" aria-hidden="true">
                {ativos}
              </span>
            ) : null}
          </button>
        ) : null}
        {ferramentas ? <div className="filtros__ferramentas">{ferramentas}</div> : null}
      </div>
      {!compacta && temGrupos ? (
        <div className="filtros__grupos">
          {children}
          {maisFiltros && (mais || maisAtivos > 0) ? (
            <div id={idMais} className="filtros__mais">
              {maisFiltros}
            </div>
          ) : null}
          {maisFiltros ? (
            <button
              type="button"
              className="filtros__limpar filtros__alternar"
              aria-expanded={mais || maisAtivos > 0}
              aria-controls={idMais}
              disabled={maisAtivos > 0}
              onClick={() => setMais((m) => !m)}
            >
              <ChevronDown size={14} aria-hidden="true" />
              {mais || maisAtivos > 0 ? "Menos filtros" : "Mais filtros"}
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="filtros__rodape">
        <p className="filtros__resumo" aria-live="polite">
          {resumo}
        </p>
        {ativos > 0 ? (
          <button type="button" className="filtros__limpar" onClick={aoLimpar}>
            <FilterX size={14} aria-hidden="true" />
            Limpar filtros <span className="num">({ativos})</span>
          </button>
        ) : null}
        {extra}
      </div>
      {compacta && temGrupos ? (
        <Dialogo aberto={folha} aoFechar={() => setFolha(false)} titulo="Filtros">
          <div className="filtros-folha">
            <div className="filtros-folha__grupos">
              {children}
              {maisFiltros}
            </div>
            <div className="filtros-folha__acoes">
              <Botao variante="fantasma" icone={FilterX} onClick={aoLimpar} disabled={ativos === 0}>
                Limpar
              </Botao>
              <Botao variante="primario" onClick={() => setFolha(false)}>
                Ver resultados
              </Botao>
            </div>
          </div>
        </Dialogo>
      ) : null}
    </section>
  );
}
