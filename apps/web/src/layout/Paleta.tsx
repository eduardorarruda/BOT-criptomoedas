import { Search } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import "../estilos/paleta.css";
import { filtrarComandos, type Comando, type GrupoComando } from "./comandosBusca";

/**
 * Paleta de comandos: uma busca que leva a qualquer tela ou ação. Chega sob demanda
 * (lazy) na primeira vez que abre. Padrão combobox + listbox (WAI-ARIA): o foco fica na
 * busca, as setas mudam a opção ativa (aria-activedescendant), Enter executa, Esc fecha.
 */
interface Props {
  readonly aberta: boolean;
  readonly comandos: readonly Comando[];
  readonly aoFechar: () => void;
}

const GRUPOS: readonly GrupoComando[] = ["Ir para", "Ações"];

export function Paleta({ aberta, comandos, aoFechar }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const busca = useRef<HTMLInputElement>(null);
  const [termo, setTermo] = useState("");
  const [ativo, setAtivo] = useState(0);
  const base = useId();
  const idLista = `${base}-lista`;
  const idOpcao = (i: number): string => `${base}-opcao-${i}`;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (aberta && !el.open) {
      el.showModal();
      busca.current?.focus();
    }
    if (!aberta && el.open) el.close();
  }, [aberta]);

  const achados = filtrarComandos(comandos, termo);
  const atual = Math.min(ativo, Math.max(0, achados.length - 1));
  const idAtivo = achados.length ? idOpcao(atual) : undefined;

  // Com a lista maior que a janela, a opção escolhida pelas setas fica sempre à vista.
  useEffect(() => {
    if (idAtivo) document.getElementById(idAtivo)?.scrollIntoView?.({ block: "nearest" });
  }, [idAtivo]);
  const executar = (c: Comando | undefined): void => {
    if (!c) return;
    aoFechar();
    setTermo("");
    setAtivo(0);
    c.executar();
  };
  const teclas = (e: KeyboardEvent<HTMLInputElement>): void => {
    const total = achados.length;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (total) setAtivo((atual + (e.key === "ArrowDown" ? 1 : total - 1)) % total);
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      setAtivo(e.key === "Home" ? 0 : Math.max(0, total - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      executar(achados[atual]);
    }
  };

  // O índice de cada opção na lista inteira (as setas andam por todas, através dos grupos).
  const indice = new Map(achados.map((c, i) => [c.id, i]));

  return (
    // eslint-disable-next-line jsx-a11y-x/click-events-have-key-events, jsx-a11y-x/no-noninteractive-element-interactions -- clicar no fundo fecha; pelo teclado, Esc fecha (onCancel)
    <dialog
      ref={ref}
      className="paleta"
      aria-label="Paleta de comandos"
      onCancel={(e) => {
        e.preventDefault();
        aoFechar();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) aoFechar();
      }}
    >
      {aberta ? (
        <div className="paleta__corpo">
          <div className="paleta__busca">
            <Search size={18} aria-hidden="true" />
            <input
              ref={busca}
              type="text"
              role="combobox"
              aria-label="Buscar comando ou tela"
              aria-expanded="true"
              aria-controls={idLista}
              aria-autocomplete="list"
              aria-activedescendant={idAtivo}
              placeholder="Ir para uma tela ou fazer uma ação…"
              value={termo}
              onChange={(e) => {
                setTermo(e.target.value);
                setAtivo(0);
              }}
              onKeyDown={teclas}
              autoComplete="off"
              spellCheck={false}
            />
            <kbd className="paleta__tecla">Esc</kbd>
          </div>
          <div className="paleta__lista" role="listbox" id={idLista} aria-label="Comandos">
            {GRUPOS.map((grupo) => {
              const doGrupo = achados.filter((c) => c.grupo === grupo);
              if (doGrupo.length === 0) return null;
              const idGrupo = `${base}-grupo-${grupo === "Ações" ? "acoes" : "ir"}`;
              return (
                <div key={grupo} role="group" aria-labelledby={idGrupo} className="paleta__grupo">
                  <div id={idGrupo} className="paleta__grupo-titulo rotulo-caixa" role="presentation">
                    {grupo}
                  </div>
                  {doGrupo.map((c) => {
                    const i = indice.get(c.id) ?? 0;
                    return (
                      // eslint-disable-next-line jsx-a11y-x/click-events-have-key-events -- o teclado age pela busca (combobox): setas e Enter
                      <div
                        key={c.id}
                        id={idOpcao(i)}
                        role="option"
                        tabIndex={-1}
                        aria-selected={i === atual}
                        className="paleta__opcao"
                        onClick={() => executar(c)}
                        onMouseMove={() => setAtivo(i)}
                      >
                        <span>{c.titulo}</span>
                        {c.atalho ? <kbd className="paleta__tecla">{c.atalho}</kbd> : null}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
          {achados.length === 0 ? (
            <p className="paleta__vazio" role="status">
              Nada com “{termo}”. Tente o nome de uma tela, como “robôs” ou “risco”.
            </p>
          ) : null}
          <p className="paleta__dicas" aria-hidden="true">
            <span>
              <kbd className="paleta__tecla">↑</kbd>
              <kbd className="paleta__tecla">↓</kbd> escolher
            </span>
            <span>
              <kbd className="paleta__tecla">Enter</kbd> abrir
            </span>
            <span>
              <kbd className="paleta__tecla">Esc</kbd> fechar
            </span>
          </p>
        </div>
      ) : null}
    </dialog>
  );
}
