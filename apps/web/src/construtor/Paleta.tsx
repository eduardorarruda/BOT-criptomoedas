import { Activity, Ban, Brackets, Clock, GitMerge, SquareEqual } from "lucide-react";
import { nomeDoBloco, TIPO_ARRASTE, useConstrutor } from "./contexto";
import type { Bloco } from "./estado";
import { CONDICOES_PRONTAS } from "./prontas";

/** Blocos para arrastar até a árvore. Pelo teclado, use os botões "+" de cada grupo. */
const BLOCOS: readonly { bloco: Bloco; icone: typeof Ban; dica: string }[] = [
  { bloco: "comparar", icone: SquareEqual, dica: "compara dois valores" },
  { bloco: "horario", icone: Clock, dica: "vale só numa janela do dia (ex.: 12:00 às 15:00)" },
  { bloco: "e", icone: Brackets, dica: "todas precisam valer" },
  { bloco: "ou", icone: GitMerge, dica: "basta uma valer" },
  { bloco: "nao", icone: Ban, dica: "inverte a condição" },
];

function Item({
  bloco,
  nome,
  dica,
  icone: Icone,
}: {
  readonly bloco: Bloco;
  readonly nome: string;
  readonly dica: string;
  readonly icone: typeof Ban;
}) {
  const { setArrastando } = useConstrutor();
  return (
    // eslint-disable-next-line jsx-a11y-x/no-noninteractive-element-interactions -- arrastar é atalho do mouse; pelo teclado, os botões "+" de cada grupo inserem o bloco
    <li
      className="paleta__bloco"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(TIPO_ARRASTE, bloco);
        e.dataTransfer.setData("text/plain", nomeDoBloco(bloco));
        e.dataTransfer.effectAllowed = "copy";
        setArrastando({ tipo: "novo", bloco });
      }}
      onDragEnd={() => setArrastando(null)}
    >
      <Icone size={16} aria-hidden="true" />
      <span>
        <strong>{nome}</strong>
        <span className="paleta__dica">{dica}</span>
      </span>
    </li>
  );
}

export function Paleta() {
  return (
    <div className="paleta">
      <p className="paleta__titulo" id="titulo-paleta">
        Blocos
      </p>
      <ul role="list" className="paleta__blocos" aria-labelledby="titulo-paleta">
        {BLOCOS.map(({ bloco, icone, dica }) => (
          <Item key={bloco} bloco={bloco} nome={nomeDoBloco(bloco)} dica={dica} icone={icone} />
        ))}
      </ul>
      <p className="paleta__titulo" id="titulo-prontas">
        Condições prontas
      </p>
      <ul role="list" className="paleta__blocos paleta__blocos--prontas" aria-labelledby="titulo-prontas">
        {CONDICOES_PRONTAS.map((c) => (
          <Item key={c.id} bloco={c.id} nome={c.nome} dica={c.dica} icone={Activity} />
        ))}
      </ul>
      <p className="paleta__ajuda">
        Arraste um bloco para a árvore. Pelo teclado, use os botões “+” e a lista “Condição pronta” dentro de
        cada grupo, e as setas de cada condição.
      </p>
    </div>
  );
}
