import { Link } from "@tanstack/react-router";
import { Menu, Moon, OctagonX, Search, Sun } from "lucide-react";
import { Dinheiro } from "../componentes/Dinheiro";
import { NumeroAnimado } from "../componentes/NumeroAnimado";
import { useResumo } from "../ganchos/consultas";
import { lojaConexao } from "../ganchos/lojas";
import { formatarCustoIa, formatarDinheiro } from "../lib/formatar";
import { useLoja } from "../lib/loja";
import type { ControleTema } from "../lib/tema";
import { Marca } from "../componentes/Marca";

const ROTULO_CONEXAO = {
  conectado: "Ao vivo",
  conectando: "Conectando…",
  reconectando: "Reconectando…",
  desligado: "Sem conexão ao vivo",
} as const;

function Conexao() {
  const estado = useLoja(lojaConexao, (s) => s);
  return (
    <span className={`conexao conexao--${estado}`} role="status">
      <span className="conexao__ponto" aria-hidden="true" />
      <span className="conexao__texto">{ROTULO_CONEXAO[estado]}</span>
    </span>
  );
}

/** Perdas, taxas e custo de IA do dia: sempre à vista, em qualquer tela. */
function Placar() {
  const { data } = useResumo();
  if (!data)
    return (
      <div className="placar placar--carregando" aria-hidden="true">
        <span className="esqueleto__linha" />
        <span className="esqueleto__linha" />
        <span className="esqueleto__linha" />
      </div>
    );
  return (
    <dl className="placar" aria-label="Hoje">
      <div>
        <dt>Resultado hoje</dt>
        <dd>
          <Dinheiro valor={data.resultadoHoje} sinal colorir animar />
        </dd>
      </div>
      <div>
        <dt>Taxas</dt>
        <dd>
          {data.taxasHoje ? (
            <NumeroAnimado valor={data.taxasHoje} formatar={(t) => formatarDinheiro(t)} />
          ) : (
            <span className="apagado">não informado</span>
          )}
        </dd>
      </div>
      <div>
        <dt>Custo de IA</dt>
        <dd>
          <NumeroAnimado valor={data.custoIaHoje} formatar={formatarCustoIa} />
        </dd>
      </div>
    </dl>
  );
}

function ParadaTotal() {
  const ligada = useResumo().data?.paradaTotal ?? false;
  if (ligada) {
    return (
      <Link to="/risco" className="pilula-parada pilula-parada--ligada">
        <OctagonX size={16} aria-hidden="true" />
        Parada total ligada
      </Link>
    );
  }
  return (
    <Link to="/risco" className="pilula-parada">
      <OctagonX size={16} aria-hidden="true" />
      Parar tudo
    </Link>
  );
}

export function BarraTopo({
  tema,
  abrirMenu,
  abrirPaleta,
}: {
  readonly tema: ControleTema;
  readonly abrirMenu: () => void;
  /** Abre a paleta de comandos (o mesmo que Ctrl/Cmd+Shift+P ou "/"). */
  readonly abrirPaleta?: () => void;
}) {
  const claro = tema.tema === "claro";
  return (
    <header className="barra-topo">
      <button
        type="button"
        className="botao-icone barra-topo__menu"
        onClick={abrirMenu}
        aria-label="Abrir menu"
      >
        <Menu size={20} aria-hidden="true" />
      </button>
      <span className="barra-topo__marca">
        <Marca tamanho={24} />
      </span>
      <Conexao />
      <Placar />
      <div className="barra-topo__acoes">
        {abrirPaleta ? (
          <button
            type="button"
            className="barra-topo__comandos"
            onClick={abrirPaleta}
            aria-label="Ir para… (paleta de comandos, tecla /)"
            aria-keyshortcuts="/ Control+Shift+P Meta+Shift+P"
            title="Paleta de comandos (/ ou Ctrl+Shift+P)"
          >
            <Search size={16} aria-hidden="true" />
            <span className="barra-topo__comandos-texto" aria-hidden="true">
              Ir para…
            </span>
            <kbd className="barra-topo__tecla" aria-hidden="true">
              /
            </kbd>
          </button>
        ) : null}
        <ParadaTotal />
        <button
          type="button"
          className="botao-icone"
          onClick={tema.alternar}
          aria-label={claro ? "Usar tema escuro" : "Usar tema claro"}
          title={claro ? "Usar tema escuro" : "Usar tema claro"}
        >
          {claro ? <Moon size={18} aria-hidden="true" /> : <Sun size={18} aria-hidden="true" />}
        </button>
      </div>
    </header>
  );
}
