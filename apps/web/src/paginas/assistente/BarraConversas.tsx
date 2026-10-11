import type { ConversaResumo } from "@zentrade/contratos/esquemas";
import { PanelLeftClose, Pencil, Search, SquarePen, Trash2, X } from "lucide-react";
import { useId, useMemo, useRef, useState, type KeyboardEvent, type Ref } from "react";
import { Confirmar } from "../../componentes/Confirmar";
import { Enso } from "../../componentes/Enso";
import { ErroCarregar, Esqueleto } from "../../componentes/Estados";
import { agruparConversas, filtrarConversas, type GrupoConversas } from "./conversas";

export interface PropsBarraConversas {
  readonly conversas: readonly ConversaResumo[];
  readonly carregando: boolean;
  readonly erro: unknown;
  readonly aoTentarDeNovo: () => void;
  readonly atual: string | null;
  readonly aoEscolher: (id: string) => void;
  readonly aoNova: () => void;
  readonly aoRenomear: (id: string, titulo: string) => void;
  readonly aoApagar: (id: string) => void;
  readonly apagando: boolean;
  /** Recolhe a barra (computador) ou fecha a gaveta (celular). */
  readonly aoFechar: () => void;
  readonly gaveta: boolean;
  readonly atalho: string;
}

function CampoRenomear({
  titulo,
  aoSalvar,
  aoCancelar,
}: {
  readonly titulo: string;
  /** `teclado`: terminou por Enter/Esc (o foco volta ao botão); por clique fora, o foco fica onde foi. */
  readonly aoSalvar: (titulo: string, teclado: boolean) => void;
  readonly aoCancelar: (teclado: boolean) => void;
}) {
  const [valor, setValor] = useState(titulo);
  const salvar = (teclado: boolean) => {
    const limpo = valor.trim();
    if (limpo && limpo !== titulo) aoSalvar(limpo, teclado);
    else aoCancelar(teclado);
  };
  const tecla = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      aoCancelar(true);
    }
  };
  return (
    <form
      className="conversa__renomear"
      onSubmit={(e) => {
        e.preventDefault();
        salvar(true);
      }}
    >
      <input
        aria-label="Novo nome da conversa"
        value={valor}
        maxLength={120}
        // eslint-disable-next-line jsx-a11y-x/no-autofocus -- a pessoa acabou de pedir para renomear: o campo é o próximo passo
        autoFocus
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => setValor(e.target.value)}
        onKeyDown={tecla}
        onBlur={() => salvar(false)}
      />
    </form>
  );
}

function Grupo({
  grupo,
  atual,
  renomeando,
  aoEscolher,
  aoRenomear,
  setRenomeando,
  setApagar,
}: {
  readonly grupo: GrupoConversas;
  readonly atual: string | null;
  readonly renomeando: string | null;
  readonly aoEscolher: (id: string) => void;
  readonly aoRenomear: (id: string, titulo: string) => void;
  readonly setRenomeando: (id: string | null) => void;
  readonly setApagar: (c: ConversaResumo) => void;
}) {
  const id = useId();
  const lista = useRef<HTMLUListElement>(null);
  const terminar = (conversaId: string, teclado: boolean) => {
    setRenomeando(null);
    if (!teclado) return;
    // Depois do próximo desenho, quando o botão de renomear voltou à tela.
    requestAnimationFrame(() =>
      lista.current?.querySelector<HTMLButtonElement>(`[data-renomear="${CSS.escape(conversaId)}"]`)?.focus(),
    );
  };
  return (
    <section className="barra__grupo" aria-labelledby={id}>
      <h2 id={id} className="barra__grupo-titulo">
        {grupo.rotulo}
      </h2>
      <ul className="barra__conversas" ref={lista}>
        {grupo.conversas.map((c) => (
          <li key={c.id} className={`conversa ${c.id === atual ? "conversa--atual" : ""}`}>
            {renomeando === c.id ? (
              <CampoRenomear
                titulo={c.titulo}
                aoSalvar={(t, teclado) => {
                  aoRenomear(c.id, t);
                  terminar(c.id, teclado);
                }}
                aoCancelar={(teclado) => terminar(c.id, teclado)}
              />
            ) : (
              <>
                <button
                  type="button"
                  className="conversa__abrir"
                  onClick={() => aoEscolher(c.id)}
                  aria-current={c.id === atual ? "page" : undefined}
                  title={c.previa || c.titulo}
                >
                  {c.titulo}
                </button>
                <span className="conversa__acoes">
                  <button
                    type="button"
                    className="conversa__acao"
                    aria-label={`Renomear “${c.titulo}”`}
                    data-renomear={c.id}
                    title="Renomear"
                    onClick={() => setRenomeando(c.id)}
                  >
                    <Pencil size={14} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="conversa__acao conversa__acao--perigo"
                    aria-label={`Apagar “${c.titulo}”`}
                    title="Apagar"
                    onClick={() => setApagar(c)}
                  >
                    <Trash2 size={14} aria-hidden="true" />
                  </button>
                </span>
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** A barra de conversas: nova conversa, busca e as conversas por data, com renomear e apagar. */
export function BarraConversas({
  buscaRef,
  ...p
}: PropsBarraConversas & { readonly buscaRef: Ref<HTMLInputElement> }) {
  const [busca, setBusca] = useState("");
  const [renomeando, setRenomeando] = useState<string | null>(null);
  const [apagar, setApagar] = useState<ConversaResumo | null>(null);
  const grupos = useMemo(() => agruparConversas(filtrarConversas(p.conversas, busca)), [p.conversas, busca]);
  const FecharIcone = p.gaveta ? X : PanelLeftClose;
  return (
    <nav className="barra" aria-label="Conversas">
      <div className="barra__topo">
        <span className="barra__marca">
          <Enso tamanho={22} />
          <span className="titulo-serif">Conversas</span>
        </span>
        <button
          type="button"
          className="botao-icone"
          onClick={p.aoFechar}
          aria-label={p.gaveta ? "Fechar as conversas" : "Esconder as conversas"}
          title={p.gaveta ? "Fechar" : "Esconder"}
        >
          <FecharIcone size={18} aria-hidden="true" />
        </button>
      </div>
      <button type="button" className="barra__nova" onClick={p.aoNova}>
        <SquarePen size={16} aria-hidden="true" />
        <span>Nova conversa</span>
        <kbd className="barra__atalho" aria-hidden="true">
          {p.atalho}⇧O
        </kbd>
      </button>
      <div className="barra__busca">
        <Search size={15} aria-hidden="true" />
        <input
          ref={buscaRef}
          type="search"
          aria-label="Buscar conversas"
          aria-keyshortcuts="Control+K Meta+K"
          placeholder="Buscar conversas"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        <kbd className="barra__atalho" aria-hidden="true">
          {p.atalho}K
        </kbd>
      </div>
      <div className="barra__lista">
        {p.carregando ? <Esqueleto linhas={5} rotulo="Carregando as conversas" /> : null}
        {p.erro ? <ErroCarregar erro={p.erro} tentarDeNovo={p.aoTentarDeNovo} compacto /> : null}
        {!p.carregando && !p.erro && grupos.length === 0 ? (
          <p className="barra__vazia">
            {busca.trim()
              ? `Nada encontrado para “${busca.trim()}”.`
              : "Nenhuma conversa ainda. Sua primeira pergunta começa uma."}
          </p>
        ) : null}
        {grupos.map((g) => (
          <Grupo
            key={g.rotulo}
            grupo={g}
            atual={p.atual}
            renomeando={renomeando}
            aoEscolher={p.aoEscolher}
            aoRenomear={p.aoRenomear}
            setRenomeando={setRenomeando}
            setApagar={setApagar}
          />
        ))}
      </div>
      <Confirmar
        aberto={apagar !== null}
        titulo="Apagar esta conversa?"
        rotuloConfirmar="Apagar conversa"
        carregando={p.apagando}
        aoCancelar={() => setApagar(null)}
        aoConfirmar={() => {
          if (apagar) p.aoApagar(apagar.id);
          setApagar(null);
        }}
      >
        {apagar ? `“${apagar.titulo}” e todas as mensagens dela somem para sempre.` : ""}
      </Confirmar>
    </nav>
  );
}
