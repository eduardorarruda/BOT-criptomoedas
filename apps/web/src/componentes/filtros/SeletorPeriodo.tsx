import { useId } from "react";
import { FiltroOpcao } from "./Chips";
import { PERIODOS, ROTULO_PERIODO, type EscolhaPeriodo, type Periodo } from "./periodo";

/** Atalhos de período e, em "Escolher datas", os dois campos de data. */
export function SeletorPeriodo({
  valor,
  aoMudar,
  rotulo = "Período",
  opcoes = PERIODOS,
}: {
  readonly valor: EscolhaPeriodo;
  readonly aoMudar: (mudanca: EscolhaPeriodo) => void;
  readonly rotulo?: string;
  readonly opcoes?: readonly Periodo[];
}) {
  const id = useId();
  const personalizado = valor.periodo === "personalizado";
  return (
    <div className="filtro-periodo">
      <FiltroOpcao
        rotulo={rotulo}
        opcoes={opcoes.filter((p) => p !== "tudo").map((p) => ({ valor: p, rotulo: ROTULO_PERIODO[p] }))}
        valor={valor.periodo === "tudo" ? undefined : valor.periodo}
        rotuloTodos={ROTULO_PERIODO.tudo}
        aoMudar={(p) =>
          aoMudar({
            periodo: p,
            de: p === "personalizado" ? valor.de : undefined,
            ate: p === "personalizado" ? valor.ate : undefined,
          })
        }
      />
      {personalizado ? (
        <div className="filtro-periodo__datas">
          <label htmlFor={`${id}-de`} className="filtro-periodo__data">
            <span>De</span>
            <input
              id={`${id}-de`}
              type="date"
              className="campo__entrada"
              value={valor.de ?? ""}
              max={valor.ate}
              onChange={(e) => aoMudar({ ...valor, de: e.target.value || undefined })}
            />
          </label>
          <label htmlFor={`${id}-ate`} className="filtro-periodo__data">
            <span>Até</span>
            <input
              id={`${id}-ate`}
              type="date"
              className="campo__entrada"
              value={valor.ate ?? ""}
              min={valor.de}
              onChange={(e) => aoMudar({ ...valor, ate: e.target.value || undefined })}
            />
          </label>
        </div>
      ) : null}
    </div>
  );
}
