import type { ConversaResumo } from "@zentrade/contratos/esquemas";
import { MessageSquarePlus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Botao } from "../../componentes/Botao";
import { formatarRelativo } from "../../lib/tempo";

/** Conversas da pessoa, mais recentes primeiro. Apagar pede uma segunda confirmação. */
export function ListaConversas({
  conversas,
  atual,
  aoEscolher,
  aoNova,
  aoApagar,
  criando,
}: {
  readonly conversas: readonly ConversaResumo[];
  readonly atual: string | null;
  readonly aoEscolher: (id: string) => void;
  readonly aoNova: () => void;
  readonly aoApagar: (id: string) => void;
  readonly criando: boolean;
}) {
  const [confirmar, setConfirmar] = useState<string | null>(null);
  return (
    <aside className="chat__lateral" aria-label="Conversas">
      <Botao
        variante="primario"
        icone={MessageSquarePlus}
        onClick={aoNova}
        carregando={criando}
        className="chat__nova"
      >
        Nova conversa
      </Botao>
      {conversas.length === 0 ? <p className="apagado chat__sem-conversas">Nenhuma conversa ainda.</p> : null}
      <ul role="list" className="chat__conversas">
        {conversas.map((c) => (
          <li key={c.id} className={`chat__conversa ${c.id === atual ? "chat__conversa--atual" : ""}`}>
            <button
              type="button"
              className="chat__conversa-abrir"
              onClick={() => aoEscolher(c.id)}
              aria-current={c.id === atual ? "true" : undefined}
            >
              <span className="chat__conversa-titulo">{c.titulo}</span>
              <span className="chat__conversa-meta apagado">
                {formatarRelativo(c.atualizadaEm)}
                {c.previa ? ` · ${c.previa}` : ""}
              </span>
            </button>
            {confirmar === c.id ? (
              <span className="chat__confirmar">
                <Botao pequeno variante="perigo" onClick={() => aoApagar(c.id)}>
                  Apagar
                </Botao>
                <Botao pequeno variante="fantasma" onClick={() => setConfirmar(null)}>
                  Manter
                </Botao>
              </span>
            ) : (
              <button
                type="button"
                className="chat__conversa-apagar"
                aria-label={`Apagar a conversa “${c.titulo}”`}
                onClick={() => setConfirmar(c.id)}
              >
                <Trash2 size={14} aria-hidden="true" />
              </button>
            )}
          </li>
        ))}
      </ul>
    </aside>
  );
}
