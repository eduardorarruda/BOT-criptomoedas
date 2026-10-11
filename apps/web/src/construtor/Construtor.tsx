import { Save } from "lucide-react";
import { useMemo, useReducer } from "react";
import { Botao } from "../componentes/Botao";
import { CampoTexto } from "../componentes/Campo";
import { Segmentado } from "../componentes/Segmentado";
import type { NovaEstrategia } from "../api/fonte";
import { EditorRegras } from "./EditorRegras";
import { montar, redutor, type EstadoConstrutor } from "./estado";
import { Previa } from "./Previa";

/** O construtor completo de uma estratégia: regras, parâmetros, prévia e salvar. */
export function Construtor({
  inicial,
  salvando,
  aoSalvar,
}: {
  readonly inicial: EstadoConstrutor;
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
        <fieldset className="construtor__parametros">
          <legend>Proteção e alvo</legend>
          <CampoTexto
            rotulo="Stop (%)"
            dica="Queda máxima a partir da entrada. Toda compra tem stop."
            inputMode="decimal"
            value={estado.stop}
            onChange={(e) => despachar({ tipo: "parametro", campo: "stop", valor: e.target.value })}
            className="campo--num"
          />
          <CampoTexto
            rotulo="Alvo líquido (%)"
            dica="Lucro que sobra depois das duas taxas."
            inputMode="decimal"
            value={estado.alvo}
            onChange={(e) => despachar({ tipo: "parametro", campo: "alvo", valor: e.target.value })}
            className="campo--num"
          />
          <CampoTexto
            rotulo="Taxa por ponta (%)"
            dica="Taxa da corretora em cada ordem (Binance: 0,1%)."
            inputMode="decimal"
            value={estado.taxa}
            onChange={(e) => despachar({ tipo: "parametro", campo: "taxa", valor: e.target.value })}
            className="campo--num"
          />
        </fieldset>
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
