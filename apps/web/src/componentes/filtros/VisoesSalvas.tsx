import { Bookmark, Trash2 } from "lucide-react";
import { useId, useRef, useState, type FormEvent } from "react";
import { apagarVisao, lerVisoes, salvarVisao, type VisaoSalva } from "./visoesSalvas";

/** Menu "Visões salvas": aplica, salva a atual com um nome ou apaga. */
export function VisoesSalvas({
  tela,
  buscaAtual,
  aoAplicar,
}: {
  readonly tela: string;
  readonly buscaAtual: Readonly<Record<string, unknown>>;
  readonly aoAplicar: (busca: Readonly<Record<string, unknown>>) => void;
}) {
  const id = useId();
  const menu = useRef<HTMLDetailsElement>(null);
  const [visoes, setVisoes] = useState<VisaoSalva[]>(() => lerVisoes(tela));
  const [nome, setNome] = useState("");
  const salvar = (e: FormEvent) => {
    e.preventDefault();
    setVisoes(salvarVisao(tela, nome, buscaAtual));
    setNome("");
  };
  const aplicar = (v: VisaoSalva) => {
    aoAplicar(v.busca);
    if (menu.current) menu.current.open = false;
  };
  return (
    <details className="visoes" ref={menu}>
      <summary className="filtros__limpar visoes__abrir">
        <Bookmark size={14} aria-hidden="true" />
        Visões salvas{visoes.length > 0 ? <span className="num"> ({visoes.length})</span> : null}
      </summary>
      <div className="visoes__painel">
        {visoes.length === 0 ? (
          <p className="apagado visoes__vazio">Salve os filtros de agora para voltar a eles com um clique.</p>
        ) : (
          <ul role="list" className="visoes__lista">
            {visoes.map((v) => (
              <li key={v.nome}>
                <button type="button" className="visoes__aplicar" onClick={() => aplicar(v)}>
                  {v.nome}
                </button>
                <button
                  type="button"
                  className="visoes__apagar"
                  aria-label={`Apagar a visão ${v.nome}`}
                  onClick={() => setVisoes(apagarVisao(tela, v.nome))}
                >
                  <Trash2 size={14} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <form className="visoes__nova" onSubmit={salvar}>
          <label htmlFor={id} className="so-leitor">
            Nome da visão
          </label>
          <input
            id={id}
            className="campo__entrada"
            placeholder="Nome desta visão"
            value={nome}
            maxLength={40}
            onChange={(e) => setNome(e.target.value)}
          />
          <button type="submit" className="ferramenta-botao" disabled={!nome.trim()}>
            Salvar
          </button>
        </form>
      </div>
    </details>
  );
}
