import { FilterX, SearchX } from "lucide-react";
import type { ReactNode } from "react";
import { Botao } from "../Botao";
import { EstadoVazio } from "../Estados";

/** Os filtros esconderam tudo: diz isso e oferece o caminho de volta. */
export function SemResultados({
  aoLimpar,
  children = "Nenhum item passa por todos os filtros escolhidos. Tire algum ou limpe todos.",
}: {
  readonly aoLimpar: () => void;
  readonly children?: ReactNode;
}) {
  return (
    <EstadoVazio
      icone={SearchX}
      titulo="Nenhum item com esses filtros"
      acao={
        <Botao icone={FilterX} onClick={aoLimpar}>
          Limpar filtros
        </Botao>
      }
    >
      {children}
    </EstadoVazio>
  );
}
