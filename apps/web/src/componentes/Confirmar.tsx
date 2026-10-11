import type { ReactNode } from "react";
import { Botao } from "./Botao";
import { Dialogo } from "./Dialogo";

/** Confirmação de ação que não se desfaz. O botão perigoso diz exatamente o que acontece. */
export function Confirmar({
  aberto,
  titulo,
  children,
  rotuloConfirmar,
  carregando = false,
  aoConfirmar,
  aoCancelar,
}: {
  readonly aberto: boolean;
  readonly titulo: string;
  readonly children: ReactNode;
  readonly rotuloConfirmar: string;
  readonly carregando?: boolean;
  readonly aoConfirmar: () => void;
  readonly aoCancelar: () => void;
}) {
  return (
    <Dialogo aberto={aberto} aoFechar={aoCancelar} titulo={titulo} descricao={children}>
      <div className="formulario__acoes">
        <Botao variante="fantasma" onClick={aoCancelar} autoFocus>
          Cancelar
        </Botao>
        <Botao variante="perigo" carregando={carregando} onClick={aoConfirmar}>
          {rotuloConfirmar}
        </Botao>
      </div>
    </Dialogo>
  );
}
