import { Save } from "lucide-react";
import { useMemo, useReducer } from "react";
import { Botao } from "../componentes/Botao";
import { CampoTexto } from "../componentes/Campo";
import { Segmentado } from "../componentes/Segmentado";
import type { NovaEstrategia } from "../api/fonte";
import { EditorRegras } from "./EditorRegras";
import { EditorSaidas } from "./EditorSaidas";
import { deModelo, montar, redutor, type EstadoConstrutor } from "./estado";
import { Modelos } from "./Modelos";
import { Previa } from "./Previa";

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
  const raiz = estado.editando === "saida" && estado.saida ? estado.saida : estado.entrada;
  const rotuloSalvar = estado.id ? `Salvar como versão ${estado.versao + 1}` : "Criar estratégia";

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
        <div className="construtor__abas">
          <Segmentado
            rotulo="Regra em edição"
            opcoes={[
              { valor: "entrada", rotulo: "Entrada (quando comprar)" },
              ...(estado.saida ? [{ valor: "saida" as const, rotulo: "Saída (quando vender antes)" }] : []),
            ]}
            valor={estado.editando}
            aoMudar={(arvore) => despachar({ tipo: "editar", arvore })}
          />
          <label className="interruptor">
            <input
              type="checkbox"
              checked={estado.saida !== null}
              onChange={(e) => despachar({ tipo: "ligarSaida", ligada: e.target.checked })}
            />
            <span>Regra de saída antecipada</span>
          </label>
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
