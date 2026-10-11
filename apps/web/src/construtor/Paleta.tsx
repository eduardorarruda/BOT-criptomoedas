import { Ban, Brackets, GitMerge, SquareEqual } from "lucide-react";
import { NOME_BLOCO, TIPO_ARRASTE, useConstrutor } from "./contexto";
import type { Bloco } from "./estado";

/** Blocos para arrastar até a árvore. Pelo teclado, use os botões "+" de cada grupo. */
const BLOCOS: readonly { bloco: Bloco; icone: typeof Ban; dica: string }[] = [
  { bloco: "comparar", icone: SquareEqual, dica: "compara dois valores" },
  { bloco: "e", icone: Brackets, dica: "todas precisam valer" },
  { bloco: "ou", icone: GitMerge, dica: "basta uma valer" },
  { bloco: "nao", icone: Ban, dica: "inverte a condição" },
];

export function Paleta() {
  const { setArrastando } = useConstrutor();
  return (
    <div className="paleta">
      <p className="paleta__titulo" id="titulo-paleta">
        Blocos
      </p>
      <ul role="list" className="paleta__blocos" aria-labelledby="titulo-paleta">
        {BLOCOS.map(({ bloco, icone: Icone, dica }) => (
          // eslint-disable-next-line jsx-a11y-x/no-noninteractive-element-interactions -- arrastar é atalho do mouse; pelo teclado, os botões "+" de cada grupo inserem o bloco
          <li
            key={bloco}
            className="paleta__bloco"
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(TIPO_ARRASTE, bloco);
              e.dataTransfer.setData("text/plain", NOME_BLOCO[bloco]);
              e.dataTransfer.effectAllowed = "copy";
              setArrastando({ tipo: "novo", bloco });
            }}
            onDragEnd={() => setArrastando(null)}
          >
            <Icone size={15} aria-hidden="true" />
            <span>
              <strong>{NOME_BLOCO[bloco]}</strong>
              <span className="paleta__dica">{dica}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="paleta__ajuda">
        Arraste um bloco para a árvore. Pelo teclado, use os botões “+” dentro de cada grupo e as setas de
        cada condição.
      </p>
    </div>
  );
}
