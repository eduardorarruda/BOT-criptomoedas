import type { Comparador } from "@zentrade/dominio";
import { ArrowDown, ArrowUp, Ban, GripVertical, Plus, Trash2 } from "lucide-react";
import { m } from "motion/react";
import type { DragEvent } from "react";
import { destinosPara, localizar, type NoComparar, type NoEditor, type NoGrupo, type NoNao } from "./arvore";
import { TIPO_ARRASTE, useConstrutor } from "./contexto";
import { frase } from "./descrever";
import { EditorOperando } from "./EditorOperando";
import type { Bloco } from "./estado";
import { ZonaSoltar } from "./Zona";

/** Um nó da árvore, desenhado de forma recursiva (a estrutura é recursiva). */
const COMPARADORES: readonly { valor: Comparador; rotulo: string }[] = [
  { valor: "<", rotulo: "< abaixo de" },
  { valor: "<=", rotulo: "≤ no máximo" },
  { valor: ">", rotulo: "> acima de" },
  { valor: ">=", rotulo: "≥ pelo menos" },
  { valor: "cruzouAcima", rotulo: "↗ cruzou para cima" },
  { valor: "cruzouAbaixo", rotulo: "↘ cruzou para baixo" },
];

const nomeDo = (no: NoEditor): string =>
  no.tipo === "comparar"
    ? `condição ${frase(no)}`
    : no.tipo === "nao"
      ? "NÃO"
      : `grupo ${no.tipo.toUpperCase()}`;

function Alca({ no }: { readonly no: NoEditor }) {
  const { setArrastando } = useConstrutor();
  const comecar = (e: DragEvent<HTMLSpanElement>): void => {
    e.dataTransfer.setData(TIPO_ARRASTE, no.id);
    e.dataTransfer.setData("text/plain", nomeDo(no));
    e.dataTransfer.effectAllowed = "move";
    const caixa = e.currentTarget.closest<HTMLElement>("[data-no-id]");
    if (caixa) e.dataTransfer.setDragImage(caixa, 16, 16);
    setArrastando({ tipo: "mover", id: no.id });
  };
  return (
    <span
      className="no__alca"
      draggable
      onDragStart={comecar}
      onDragEnd={() => setArrastando(null)}
      title="Arraste para mover (ou use os botões ao lado)"
      aria-hidden="true"
    >
      <GripVertical size={16} />
    </span>
  );
}

function Acoes({ no }: { readonly no: NoEditor }) {
  const { raiz, despachar, anunciar, focar } = useConstrutor();
  const local = localizar(raiz, no.id);
  if (!local?.pai) return null;
  const irmaos = local.pai.tipo === "nao" ? 1 : local.pai.filhos.length;
  const destinos = destinosPara(raiz, no.id);
  const nome = nomeDo(no);
  const moverIrmao = (delta: -1 | 1): void => {
    despachar({ tipo: "moverIrmao", id: no.id, delta });
    anunciar(delta === -1 ? "Subiu uma posição." : "Desceu uma posição.");
    focar(no.id);
  };
  return (
    <span className="no__acoes">
      <button
        type="button"
        className="botao-icone botao-icone--p"
        aria-label={`Subir ${nome}`}
        disabled={local.indice === 0}
        onClick={() => moverIrmao(-1)}
      >
        <ArrowUp size={15} aria-hidden="true" />
      </button>
      <button
        type="button"
        className="botao-icone botao-icone--p"
        aria-label={`Descer ${nome}`}
        disabled={local.indice >= irmaos - 1}
        onClick={() => moverIrmao(1)}
      >
        <ArrowDown size={15} aria-hidden="true" />
      </button>
      {destinos.length ? (
        <select
          className="no__mover"
          aria-label={`Mover ${nome} para outro grupo`}
          value=""
          onChange={(e) => {
            const destino = destinos.find((d) => d.id === e.target.value);
            if (!destino) return;
            despachar({ tipo: "mover", id: no.id, destinoId: destino.id, indice: Number.MAX_SAFE_INTEGER });
            anunciar(`Movido para ${destino.rotulo}.`);
            focar(no.id);
          }}
        >
          <option value="">Mover para…</option>
          {destinos.map((d) => (
            <option key={d.id} value={d.id}>
              {d.rotulo}
            </option>
          ))}
        </select>
      ) : null}
      <button
        type="button"
        className={`botao-icone botao-icone--p ${no.tipo === "nao" ? "botao-icone--ativo" : ""}`}
        aria-label={no.tipo === "nao" ? "Tirar o NÃO" : `Negar ${nome} (envolver em NÃO)`}
        title={no.tipo === "nao" ? "Tirar o NÃO" : "Envolver em NÃO"}
        onClick={() => {
          despachar({ tipo: "nao", id: no.id });
          anunciar(no.tipo === "nao" ? "NÃO retirado." : "Envolvido em NÃO.");
        }}
      >
        <Ban size={15} aria-hidden="true" />
      </button>
      <button
        type="button"
        className="botao-icone botao-icone--p botao-icone--perigo"
        aria-label={`Remover ${nome}`}
        onClick={() => {
          despachar({ tipo: "remover", id: no.id });
          anunciar(`${nome[0]?.toUpperCase()}${nome.slice(1)} removido.`);
        }}
      >
        <Trash2 size={15} aria-hidden="true" />
      </button>
    </span>
  );
}

function Adicionar({ destino }: { readonly destino: NoGrupo | NoNao }) {
  const { despachar, anunciar } = useConstrutor();
  const indice = destino.tipo === "nao" ? 0 : destino.filhos.length;
  const nomeDestino = destino.tipo === "nao" ? "NÃO" : `grupo ${destino.tipo.toUpperCase()}`;
  const blocos: readonly [Bloco, string][] =
    destino.tipo === "nao"
      ? [
          ["comparar", "Condição"],
          ["e", "Grupo E"],
          ["ou", "Grupo OU"],
        ]
      : [
          ["comparar", "Condição"],
          ["e", "Grupo E"],
          ["ou", "Grupo OU"],
          ["nao", "NÃO"],
        ];
  return (
    <div className="no__adicionar" role="group" aria-label={`Adicionar ao ${nomeDestino}`}>
      {blocos.map(([bloco, rotulo]) => (
        <button
          key={bloco}
          type="button"
          className="botao botao--fantasma botao--pequeno"
          onClick={() => {
            despachar({ tipo: "adicionar", destinoId: destino.id, indice, bloco });
            anunciar(`${rotulo} adicionado ao ${nomeDestino}.`);
          }}
        >
          <Plus size={14} aria-hidden="true" />
          {rotulo}
        </button>
      ))}
    </div>
  );
}

function Comparacao({ no }: { readonly no: NoComparar }) {
  const { despachar } = useConstrutor();
  const trocar = (parcial: Partial<NoComparar>): void =>
    despachar({ tipo: "trocarNo", no: { ...no, ...parcial } });
  return (
    <div className="no__comparacao">
      <EditorOperando
        operando={no.esquerda}
        rotulo="Lado esquerdo"
        aoMudar={(esquerda) => trocar({ esquerda })}
      />
      <select
        className="no__comparador"
        aria-label="Comparação"
        value={no.comparador}
        onChange={(e) => trocar({ comparador: e.target.value as Comparador })}
      >
        {COMPARADORES.map((c) => (
          <option key={c.valor} value={c.valor}>
            {c.rotulo}
          </option>
        ))}
      </select>
      <EditorOperando
        operando={no.direita}
        rotulo="Lado direito"
        aoMudar={(direita) => trocar({ direita })}
      />
    </div>
  );
}

export function NoVisual({ no, ehRaiz = false }: { readonly no: NoEditor; readonly ehRaiz?: boolean }) {
  const { despachar, anunciar } = useConstrutor();
  const comum = {
    "data-no-id": no.id,
    tabIndex: -1,
    layout: "position" as const,
    transition: { duration: 0.22, ease: [0.2, 0.7, 0.2, 1] as const },
  };

  if (no.tipo === "comparar") {
    return (
      <m.div className="no no--comparar" {...comum}>
        {ehRaiz ? null : <Alca no={no} />}
        <Comparacao no={no} />
        <Acoes no={no} />
      </m.div>
    );
  }

  if (no.tipo === "nao") {
    return (
      <m.div className="no no--nao" {...comum}>
        <div className="no__cabeca">
          {ehRaiz ? null : <Alca no={no} />}
          <span className="no__tipo no__tipo--fixo">NÃO</span>
          <span className="no__explica">a condição abaixo não pode valer</span>
          <Acoes no={no} />
        </div>
        <div className="no__filhos">
          {no.filho ? <NoVisual no={no.filho} /> : <ZonaSoltar destinoId={no.id} indice={0} rotulo="NÃO" />}
          {no.filho ? null : <Adicionar destino={no} />}
        </div>
      </m.div>
    );
  }

  const outro = no.tipo === "e" ? "OU" : "E";
  return (
    <m.div className={`no no--grupo no--${no.tipo}`} {...comum}>
      <div className="no__cabeca">
        {ehRaiz ? null : <Alca no={no} />}
        <button
          type="button"
          className="no__tipo"
          aria-label={`Grupo ${no.tipo.toUpperCase()}: ${no.tipo === "e" ? "todas precisam valer" : "basta uma valer"}. Trocar para ${outro}`}
          onClick={() => {
            despachar({ tipo: "alternarGrupo", id: no.id });
            anunciar(`Agora é um grupo ${outro}.`);
          }}
        >
          {no.tipo.toUpperCase()}
        </button>
        <span className="no__explica">{no.tipo === "e" ? "todas precisam valer" : "basta uma valer"}</span>
        <Acoes no={no} />
      </div>
      <ol role="list" className="no__filhos">
        <li className="no__zona">
          <ZonaSoltar destinoId={no.id} indice={0} rotulo={`grupo ${no.tipo.toUpperCase()}`} />
        </li>
        {no.filhos.map((f, i) => (
          <li key={f.id}>
            <NoVisual no={f} />
            <ZonaSoltar destinoId={no.id} indice={i + 1} rotulo={`grupo ${no.tipo.toUpperCase()}`} />
          </li>
        ))}
      </ol>
      {no.filhos.length === 0 ? (
        <p className="no__vazio">Grupo vazio: adicione uma condição ou arraste um bloco para cá.</p>
      ) : null}
      <Adicionar destino={no} />
    </m.div>
  );
}
