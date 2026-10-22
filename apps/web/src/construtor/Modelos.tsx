import { AVISO_MODELOS, direcaoDe, TODOS_OS_MODELOS, type ModeloEstrategia } from "@zentrade/dominio";
import { BookOpen, ChartCandlestick } from "lucide-react";
import { useState } from "react";
import { Botao } from "../componentes/Botao";
import { Selo } from "../componentes/Selo";
import { frase } from "./descrever";
import { deRegra } from "./arvore";

const INTERVALO: Record<NonNullable<ModeloEstrategia["intervalo"]>, string> = {
  "5m": "5 min",
  "15m": "15 min",
  "1h": "1 h",
  "4h": "4 h",
};

const DIRECAO = { comprado: "só comprado", vendido: "só vendido", ambos: "nos dois sentidos" } as const;

/**
 * "Mini índice (WIN) · 5 min · nos dois sentidos" nos modelos do mini índice; "Velas de 4 h" nos de
 * cripto pensados para um intervalo só (o cofre de tendência); os outros não levam selo.
 */
export function seloModelo(m: ModeloEstrategia): string | null {
  if (m.mercado !== "win") return m.intervalo ? `Velas de ${INTERVALO[m.intervalo]}` : null;
  return [
    "Mini índice (WIN)",
    ...(m.intervalo ? [INTERVALO[m.intervalo]] : []),
    DIRECAO[direcaoDe(m.estrategia)],
  ].join(" · ");
}

/**
 * "Começar de um modelo": exemplos conhecidos, com a ideia, onde tendem a
 * funcionar e onde tendem a falhar. Usar um modelo preenche o construtor; nada é
 * salvo até a pessoa clicar em criar.
 */
export function Modelos({
  aoUsar,
  abertoInicial = false,
}: {
  readonly aoUsar: (m: ModeloEstrategia) => void;
  /** Sem nenhuma estratégia ainda, os modelos já vêm abertos: são o melhor começo. */
  readonly abertoInicial?: boolean;
}) {
  const [aberto, setAberto] = useState(abertoInicial);
  return (
    <details className="modelos" open={aberto} onToggle={(e) => setAberto(e.currentTarget.open)}>
      <summary className="modelos__resumo">
        <BookOpen size={16} aria-hidden="true" /> Começar de um modelo
        <span className="apagado"> · {TODOS_OS_MODELOS.length} exemplos para estudar e adaptar</span>
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
        {TODOS_OS_MODELOS.map((m) => {
          const selo = seloModelo(m);
          return (
            <li key={m.id} className="modelos__item">
              <h2 className="modelos__nome">{m.nome}</h2>
              {selo ? (
                <Selo tom="info" icone={ChartCandlestick}>
                  {selo}
                </Selo>
              ) : null}
              {direcaoDe(m.estrategia) !== "vendido" ? (
                <p className="modelos__regra">
                  <strong>Compra quando</strong> {frase(deRegra(m.estrategia.entrada))}.
                </p>
              ) : null}
              {m.estrategia.entradaVendida && direcaoDe(m.estrategia) !== "comprado" ? (
                <p className="modelos__regra">
                  <strong>Vende quando</strong> {frase(deRegra(m.estrategia.entradaVendida))}.
                </p>
              ) : null}
              <p className="modelos__descricao">{m.descricao}</p>
              <Botao
                variante="secundario"
                onClick={() => aoUsar(m)}
                aria-label={`Usar este modelo: ${m.nome}`}
              >
                Usar este modelo
              </Botao>
            </li>
          );
        })}
      </ul>
    </>
  );
}
