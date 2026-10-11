import { ArrowDownWideNarrow, ArrowUpNarrowWide, Rows3, Rows4, type LucideIcon } from "lucide-react";
import { useId } from "react";
import type { Direcao } from "./logica";

/** Ordenar, trocar a visão e a densidade: mudam a forma de ver, não o que se vê. */
export interface OpcaoOrdem<T extends string> {
  readonly valor: T;
  readonly rotulo: string;
  /** Direção que faz sentido ao escolher esta ordem (ex.: valor do maior; vencimento do mais perto). */
  readonly direcao: Direcao;
}

export function SeletorOrdem<T extends string>({
  opcoes,
  valor,
  direcao,
  aoMudar,
}: {
  readonly opcoes: readonly OpcaoOrdem<T>[];
  readonly valor: T;
  readonly direcao: Direcao;
  readonly aoMudar: (ordem: T, direcao: Direcao) => void;
}) {
  const id = useId();
  const Icone = direcao === "asc" ? ArrowUpNarrowWide : ArrowDownWideNarrow;
  const texto = direcao === "asc" ? "crescente" : "decrescente";
  return (
    <div className="ferramenta-ordem">
      <label htmlFor={id} className="ferramenta-ordem__rotulo">
        Ordenar
      </label>
      <select
        id={id}
        className="ferramenta-ordem__selecao"
        value={valor}
        onChange={(e) => {
          const nova = opcoes.find((o) => o.valor === e.target.value);
          if (nova) aoMudar(nova.valor, nova.direcao);
        }}
      >
        {opcoes.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.rotulo}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="ferramenta-botao"
        onClick={() => aoMudar(valor, direcao === "asc" ? "desc" : "asc")}
        aria-label={`Ordem ${texto}; inverter`}
        title={`Ordem ${texto}`}
      >
        <Icone size={16} aria-hidden="true" />
      </button>
    </div>
  );
}

export interface OpcaoVisao<T extends string> {
  readonly valor: T;
  readonly rotulo: string;
  readonly icone: LucideIcon;
}

export function AlternarVisao<T extends string>({
  opcoes,
  valor,
  aoMudar,
}: {
  readonly opcoes: readonly OpcaoVisao<T>[];
  readonly valor: T;
  readonly aoMudar: (v: T) => void;
}) {
  const nome = useId();
  return (
    <fieldset className="ferramenta-visao">
      <legend className="so-leitor">Visão</legend>
      {opcoes.map(({ valor: v, rotulo, icone: Icone }) => (
        <label key={v} className="ferramenta-visao__opcao" title={rotulo}>
          <input
            type="radio"
            name={nome}
            className="chip__entrada"
            checked={valor === v}
            onChange={() => aoMudar(v)}
          />
          <Icone size={16} aria-hidden="true" />
          <span className="ferramenta-visao__texto">{rotulo}</span>
        </label>
      ))}
    </fieldset>
  );
}

export function AlternarDensidade({
  compacta,
  aoMudar,
}: {
  readonly compacta: boolean;
  readonly aoMudar: (compacta: boolean) => void;
}) {
  const Icone = compacta ? Rows4 : Rows3;
  return (
    <button
      type="button"
      className="ferramenta-botao"
      aria-pressed={compacta}
      onClick={() => aoMudar(!compacta)}
      title={compacta ? "Densidade compacta" : "Densidade confortável"}
    >
      <Icone size={16} aria-hidden="true" />
      <span className="so-leitor">Compacto</span>
    </button>
  );
}
