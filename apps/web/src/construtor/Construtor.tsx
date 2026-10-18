import type { Direcao } from "@zentrade/dominio";
import { Info, Save } from "lucide-react";
import { useMemo, useReducer } from "react";
import { Botao } from "../componentes/Botao";
import { CampoTexto } from "../componentes/Campo";
import { Segmentado } from "../componentes/Segmentado";
import type { NovaEstrategia } from "../api/fonte";
import { EditorRegras } from "./EditorRegras";
import { EditorSaidas } from "./EditorSaidas";
import { arvoresVisiveis, deModelo, montar, redutor, type Arvore, type EstadoConstrutor } from "./estado";
import { Modelos } from "./Modelos";
import { Previa } from "./Previa";

const DIRECOES: readonly { valor: Direcao; rotulo: string }[] = [
  { valor: "comprado", rotulo: "Só comprado" },
  { valor: "vendido", rotulo: "Só vendido" },
  { valor: "ambos", rotulo: "Os dois sentidos" },
];

const ABA: Record<Arvore, string> = {
  entrada: "Entrada (quando comprar)",
  saida: "Saída (quando vender antes)",
  entradaVendida: "Entrada vendida (quando vender)",
  saidaVendida: "Saída vendida (quando recomprar antes)",
};

/** No "só vendido", a entrada comprada só aparece quando tem problema: ela fica guardada sem uso. */
const rotuloAba = (a: Arvore, e: EstadoConstrutor): string =>
  a === "entrada" && e.direcao === "vendido" ? "Entrada comprada (sem uso no só vendido)" : ABA[a];

/** O construtor completo de uma estratégia: modelos, regras, saídas, prévia e salvar. */
export function Construtor({
  inicial,
  salvando,
  aoSalvar,
  modelosAbertos = false,
}: {
  readonly inicial: EstadoConstrutor;
  readonly modelosAbertos?: boolean;
  readonly salvando: boolean;
  readonly aoSalvar: (id: string | null, e: NovaEstrategia) => void;
}) {
  const [estado, despachar] = useReducer(redutor, inicial);
  const montagem = useMemo(() => montar(estado), [estado]);
  const visiveis = arvoresVisiveis(estado);
  const raiz = estado[estado.editando] ?? estado.entrada;
  const rotuloSalvar = estado.id ? `Salvar como versão ${estado.versao + 1}` : "Criar estratégia";
  const compra = estado.direcao !== "vendido";
  const vende = estado.direcao !== "comprado";

  return (
    <div className="construtor">
      <div className="construtor__principal">
        {estado.id === null ? (
          <Modelos
            abertoInicial={modelosAbertos}
            aoUsar={(m) => despachar({ tipo: "carregar", estado: deModelo(m) })}
          />
        ) : null}
        <CampoTexto
          rotulo="Nome da estratégia"
          value={estado.nome}
          onChange={(e) => despachar({ tipo: "nome", nome: e.target.value })}
          maxLength={80}
        />
        <div className="construtor__direcao">
          <Segmentado
            rotulo="Direção"
            opcoes={DIRECOES}
            valor={estado.direcao}
            aoMudar={(direcao) => despachar({ tipo: "direcao", direcao })}
          />
          <p className="nota">
            <Info size={16} aria-hidden="true" />
            <span>
              Vender a descoberto (ganhar na queda) só existe no backtest do mini índice (WIN). O robô e o
              backtest de cripto só compram: com “Só vendido” ou “Os dois sentidos”, a estratégia roda só no
              backtest do WIN. No lado vendido, stop, alvo e stop móvel são o espelho do comprado.
            </span>
          </p>
        </div>
        <div className="construtor__abas">
          <Segmentado
            rotulo="Regra em edição"
            opcoes={visiveis.map((a) => ({ valor: a, rotulo: rotuloAba(a, estado) }))}
            valor={estado.editando}
            aoMudar={(arvore) => despachar({ tipo: "editar", arvore })}
          />
          <div className="construtor__interruptores">
            {compra ? (
              <label className="interruptor">
                <input
                  type="checkbox"
                  checked={estado.saida !== null}
                  onChange={(e) => despachar({ tipo: "ligarSaida", ligada: e.target.checked })}
                />
                <span>{vende ? "Regra de saída antecipada da compra" : "Regra de saída antecipada"}</span>
              </label>
            ) : null}
            {vende ? (
              <label className="interruptor">
                <input
                  type="checkbox"
                  checked={estado.saidaVendida !== null}
                  onChange={(e) => despachar({ tipo: "ligarSaidaVendida", ligada: e.target.checked })}
                />
                <span>Regra de saída antecipada da venda</span>
              </label>
            ) : null}
          </div>
        </div>
        <EditorRegras key={raiz.id} raiz={raiz} despachar={despachar} />
        <EditorSaidas estado={estado} despachar={despachar} />
        <div className="construtor__salvar">
          <Botao
            variante="primario"
            icone={Save}
            carregando={salvando}
            disabled={!montagem.estrategia}
            aria-describedby={montagem.estrategia ? undefined : "previa-validacao"}
            onClick={() => montagem.estrategia && aoSalvar(estado.id, montagem.estrategia)}
          >
            {rotuloSalvar}
          </Botao>
          {montagem.estrategia ? null : (
            <span className="apagado">Resolva os pontos em “Pronta para salvar?”.</span>
          )}
        </div>
      </div>
      <Previa estado={estado} montagem={montagem} />
    </div>
  );
}
