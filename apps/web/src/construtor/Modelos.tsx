import { AVISO_MODELOS, MODELOS, type ModeloEstrategia } from "@zentrade/dominio";
import { BookOpen } from "lucide-react";
import { useState } from "react";
import { Botao } from "../componentes/Botao";
import { frase } from "./descrever";
import { deRegra } from "./arvore";

/**
 * "Começar de um modelo": exemplos conhecidos, com a ideia, onde tendem a
 * funcionar e onde tendem a falhar. Usar um modelo preenche o construtor; nada é
 * salvo até a pessoa clicar em criar.
 */
export function Modelos({ aoUsar }: { readonly aoUsar: (m: ModeloEstrategia) => void }) {
  const [aberto, setAberto] = useState(false);
  return (
    <details className="modelos" open={aberto} onToggle={(e) => setAberto(e.currentTarget.open)}>
      <summary className="modelos__resumo">
        <BookOpen size={16} aria-hidden="true" /> Começar de um modelo
        <span className="apagado"> — {MODELOS.length} exemplos para estudar e adaptar</span>
      </summary>
      {aberto ? <ListaModelos aoUsar={aoUsar} /> : null}
    </details>
  );
}

function ListaModelos({ aoUsar }: { readonly aoUsar: (m: ModeloEstrategia) => void }) {
  return (
    <>
      <p className="nota modelos__aviso">{AVISO_MODELOS}</p>
      <ul role="list" className="modelos__lista">
        {MODELOS.map((m) => (
          <li key={m.id} className="modelos__item">
            <h3 className="modelos__nome">{m.nome}</h3>
            <p className="modelos__regra">
              <strong>Compra quando</strong> {frase(deRegra(m.estrategia.entrada))}.
            </p>
            <p className="modelos__descricao">{m.descricao}</p>
            <Botao variante="secundario" onClick={() => aoUsar(m)} aria-label={`Usar este modelo: ${m.nome}`}>
              Usar este modelo
            </Botao>
          </li>
        ))}
      </ul>
    </>
  );
}
