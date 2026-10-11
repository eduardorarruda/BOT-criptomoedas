import { Check } from "lucide-react";
import { useId, type ReactNode } from "react";
import { alternarNaLista } from "./logica";

/**
 * Filtros em pastilhas: caixas e rádios nativos com cara de botão (o teclado e o
 * leitor de tela funcionam como em qualquer formulário). A contagem ao lado diz
 * quantos itens cada opção traz, para ninguém escolher às cegas.
 */
export interface OpcaoFiltro<T extends string> {
  readonly valor: T;
  readonly rotulo: string;
  readonly contagem?: number;
}

function Contagem({ n }: { readonly n: number | undefined }) {
  if (n === undefined) return null;
  return <span className="chip__contagem num">{n}</span>;
}

function Grupo({ rotulo, children }: { readonly rotulo: string; readonly children: ReactNode }) {
  return (
    <fieldset className="filtro-grupo">
      <legend className="filtro-grupo__rotulo">{rotulo}</legend>
      <div className="filtro-grupo__opcoes">{children}</div>
    </fieldset>
  );
}

/** Escolha múltipla. Nada marcado = sem filtro. */
export function FiltroChips<T extends string>({
  rotulo,
  opcoes,
  selecionados,
  aoMudar,
}: {
  readonly rotulo: string;
  readonly opcoes: readonly OpcaoFiltro<T>[];
  readonly selecionados: readonly T[];
  readonly aoMudar: (valores: T[]) => void;
}) {
  if (opcoes.length === 0) return null;
  return (
    <Grupo rotulo={rotulo}>
      {opcoes.map((o) => {
        const marcado = selecionados.includes(o.valor);
        // Opção que não traria nada com os outros filtros: continua lá (a lista não pula), mas apagada.
        const vazia = o.contagem === 0 && !marcado;
        return (
          <label key={o.valor} className={`chip ${vazia ? "chip--vazio" : ""}`}>
            <input
              type="checkbox"
              className="chip__entrada"
              checked={marcado}
              onChange={() => {
                // Sempre na ordem das opções: a mesma escolha gera a mesma URL.
                const nova = alternarNaLista(selecionados, o.valor);
                aoMudar(opcoes.map((x) => x.valor).filter((v) => nova.includes(v)));
              }}
            />
            <Check size={13} strokeWidth={2.4} aria-hidden="true" className="chip__marca" />
            <span>{o.rotulo}</span>
            <Contagem n={o.contagem} />
          </label>
        );
      })}
    </Grupo>
  );
}

/** Escolha única com "Todos" (sem filtro) primeiro. */
export function FiltroOpcao<T extends string>({
  rotulo,
  opcoes,
  valor,
  aoMudar,
  rotuloTodos = "Todos",
}: {
  readonly rotulo: string;
  readonly opcoes: readonly OpcaoFiltro<T>[];
  readonly valor: T | undefined;
  readonly aoMudar: (v: T | undefined) => void;
  readonly rotuloTodos?: string | null;
}) {
  const nome = useId();
  const todas: readonly OpcaoFiltro<T | "">[] =
    rotuloTodos === null ? opcoes : [{ valor: "", rotulo: rotuloTodos }, ...opcoes];
  return (
    <Grupo rotulo={rotulo}>
      {todas.map((o) => (
        <label
          key={o.valor || "todos"}
          className={`chip ${o.contagem === 0 && (valor ?? "") !== o.valor ? "chip--vazio" : ""}`}
        >
          <input
            type="radio"
            name={nome}
            className="chip__entrada"
            checked={(valor ?? "") === o.valor}
            onChange={() => aoMudar(o.valor === "" ? undefined : (o.valor as T))}
          />
          <span>{o.rotulo}</span>
          <Contagem n={o.contagem} />
        </label>
      ))}
    </Grupo>
  );
}

/** Liga/desliga um recorte (ex.: "só com saldo"). */
export function Interruptor({
  rotulo,
  ligado,
  aoMudar,
  contagem,
}: {
  readonly rotulo: string;
  readonly ligado: boolean;
  readonly aoMudar: (ligado: boolean) => void;
  readonly contagem?: number;
}) {
  return (
    <label className="chip chip--interruptor">
      <input
        type="checkbox"
        role="switch"
        className="chip__entrada"
        checked={ligado}
        onChange={(e) => aoMudar(e.target.checked)}
      />
      <span className="chip__trilho" aria-hidden="true" />
      <span>{rotulo}</span>
      <Contagem n={contagem} />
    </label>
  );
}

/** Agrupa interruptores soltos com um título, como os outros grupos. */
export function GrupoFiltro({ rotulo, children }: { readonly rotulo: string; readonly children: ReactNode }) {
  return <Grupo rotulo={rotulo}>{children}</Grupo>;
}
