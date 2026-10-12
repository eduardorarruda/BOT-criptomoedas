import { useState } from "react";
import { podeReceber } from "./arvore";
import { nomeDoBloco, TIPO_ARRASTE, useConstrutor } from "./contexto";

/** Faixa onde se solta um bloco. Só aparece durante o arraste e só onde o bloco cabe. */
export function ZonaSoltar({
  destinoId,
  indice,
  rotulo,
}: {
  readonly destinoId: string;
  readonly indice: number;
  readonly rotulo: string;
}) {
  const { raiz, arrastando, setArrastando, despachar, anunciar, focar } = useConstrutor();
  const [sobre, setSobre] = useState(false);
  if (!arrastando) return null;
  const movendo = arrastando.tipo === "mover" ? arrastando.id : undefined;
  if (!podeReceber(raiz, destinoId, movendo)) return null;

  return (
    // eslint-disable-next-line jsx-a11y-x/no-static-element-interactions -- zona de soltar do mouse; o teclado move blocos pelos botões do construtor
    <div
      className={`zona ${sobre ? "zona--sobre" : ""}`}
      data-testid={`zona-${destinoId}-${indice}`}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = arrastando.tipo === "novo" ? "copy" : "move";
        setSobre(true);
      }}
      onDragLeave={() => setSobre(false)}
      onDrop={(e) => {
        e.preventDefault();
        setSobre(false);
        if (arrastando.tipo === "novo") {
          despachar({ tipo: "adicionar", destinoId, indice, bloco: arrastando.bloco });
          anunciar(`${nomeDoBloco(arrastando.bloco)} adicionado em ${rotulo}.`);
        } else {
          despachar({ tipo: "mover", id: arrastando.id, destinoId, indice });
          anunciar(`Movido para ${rotulo}.`);
          focar(arrastando.id);
        }
        e.dataTransfer.clearData(TIPO_ARRASTE);
        setArrastando(null);
      }}
    >
      Soltar aqui
    </div>
  );
}
