import { useId } from "react";

/** Escolha única entre poucas opções (rádios nativos com cara de botões). Setas trocam a opção. */
interface Opcao<T extends string> {
  readonly valor: T;
  readonly rotulo: string;
}

export function Segmentado<T extends string>({
  rotulo,
  opcoes,
  valor,
  aoMudar,
  ocultarRotulo = false,
}: {
  readonly rotulo: string;
  readonly opcoes: readonly Opcao<T>[];
  readonly valor: T;
  readonly aoMudar: (v: T) => void;
  readonly ocultarRotulo?: boolean;
}) {
  const nome = useId();
  return (
    <fieldset className="segmentado">
      <legend className={ocultarRotulo ? "so-leitor" : "segmentado__rotulo"}>{rotulo}</legend>
      <div className="segmentado__opcoes">
        {opcoes.map((o) => (
          <label key={o.valor} className="segmentado__opcao">
            <input
              type="radio"
              name={nome}
              value={o.valor}
              checked={valor === o.valor}
              onChange={() => aoMudar(o.valor)}
            />
            <span>{o.rotulo}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
