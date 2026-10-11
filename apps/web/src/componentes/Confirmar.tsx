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
        {/* eslint-disable-next-line jsx-a11y-x/no-autofocus -- num pedido de confirmação, o foco começa em Cancelar (o caminho seguro) */}
        <Botao variante="fantasma" onClick={aoCancelar} disabled={carregando} autoFocus>
          Cancelar
        </Botao>
        <Botao variante="perigo" carregando={carregando} onClick={aoConfirmar}>
          {rotuloConfirmar}
        </Botao>
      </div>
    </Dialogo>
  );
}
