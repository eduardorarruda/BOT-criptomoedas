import { Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { LogOut, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { m } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useFonte } from "../api/contexto";
import { mensagemDe } from "../api/erros";
import { useAvisos } from "../componentes/Avisos";
import { ContextoSecao } from "../componentes/Cabecalho";
import { Enso } from "../componentes/Enso";
import { Marca } from "../componentes/Marca";
import { useSessao } from "../ganchos/consultas";
import { useSair } from "../ganchos/mutacoes";
import { useMenosMovimento } from "../ganchos/movimento";
import { useTempoReal } from "../ganchos/useTempoReal";
import { useMenuRecolhido, type ControleMenu } from "../lib/menuRecolhido";
import { useTema } from "../lib/tema";
import { AvisoDemo } from "./AvisoDemo";
import { BarraTopo } from "./BarraTopo";
import { useComandosGlobais } from "./ComandosGlobais";
import { Navegacao } from "./Navegacao";
import { grupoDe } from "./navegacao";
import { RodapeLegal } from "./RodapeLegal";

/** A moldura de todas as telas depois de entrar: menu, barra de status e a página. */
export function Casca() {
  const fonte = useFonte();
  const tema = useTema();
  const menu = useMenuRecolhido();
  const [menuAberto, setMenuAberto] = useState(false);
  const { pathname } = useLocation();
  useTempoReal();
  const comandos = useComandosGlobais({ tema, menu });

  return (
    <div className={`app ${menu.recolhido ? "app--recolhida" : ""}`}>
      <a className="pular-para-conteudo" href="#conteudo">
        Pular para o conteúdo
      </a>
      <div className="app__grade">
        <aside className="lateral">
          <div className="lateral__marca">
            {menu.recolhido ? <Enso tamanho={28} rotulo="ZenTrade" /> : <Marca tamanho={28} />}
          </div>
          <div className="lateral__rolagem">
            <Navegacao recolhida={menu.recolhido} />
          </div>
          <RodapeLateral menu={menu} />
        </aside>
        <div className="principal">
          {fonte.demo ? <AvisoDemo /> : null}
          <BarraTopo
            tema={tema}
            abrirMenu={() => setMenuAberto(true)}
            abrirPaleta={comandos.controle.abrirPaleta}
          />
          <main id="conteudo" className="conteudo" tabIndex={-1}>
            <ContextoSecao.Provider value={grupoDe(pathname)}>
              <TransicaoPagina />
            </ContextoSecao.Provider>
          </main>
          <RodapeLegal className="casca__rodape-legal" />
        </div>
      </div>
      <MenuMovel aberto={menuAberto} aoFechar={() => setMenuAberto(false)} />
      {comandos.elementos}
    </div>
  );
}

/** Iniciais para o avatar ("Você Exemplo" → "VE"; só e-mail → primeira letra). */
function iniciais(texto: string | undefined): string {
  const partes = (texto ?? "").split(/[\s@.]+/).filter(Boolean);
  return (
    partes.length > 1 ? `${partes[0]?.[0] ?? ""}${partes[1]?.[0] ?? ""}` : (partes[0]?.[0] ?? "?")
  ).toUpperCase();
}

function RodapeLateral({ menu }: { readonly menu?: ControleMenu }) {
  const usuario = useSessao().data;
  const sair = useSair();
  const navegar = useNavigate();
  const avisar = useAvisos();
  const recolhido = menu?.recolhido ?? false;
  return (
    <div className="lateral__rodape">
      <div className="lateral__usuario" title={usuario?.email}>
        <span className="lateral__avatar" aria-hidden="true">
          {iniciais(usuario?.nome ?? usuario?.email)}
        </span>
        <span className="lateral__identidade">
          <span className="lateral__nome">{usuario?.nome ?? usuario?.email}</span>
          {usuario?.nome && usuario.email ? <span className="lateral__email">{usuario.email}</span> : null}
        </span>
      </div>
      <div className="lateral__botoes">
        {menu ? (
          <button
            type="button"
            className="botao-icone lateral__recolher"
            aria-label={recolhido ? "Expandir menu" : "Recolher menu"}
            title={recolhido ? "Expandir menu" : "Recolher menu"}
            aria-pressed={recolhido}
            onClick={menu.alternar}
          >
            {recolhido ? (
              <PanelLeftOpen size={18} aria-hidden="true" />
            ) : (
              <PanelLeftClose size={18} aria-hidden="true" />
            )}
          </button>
        ) : null}
        <button
          type="button"
          className="botao-icone"
          aria-label="Sair"
          title="Sair"
          onClick={() =>
            sair.mutate(undefined, {
              onSuccess: () => void navegar({ to: "/entrar" }),
              onError: (e) => avisar("erro", mensagemDe(e)),
            })
          }
        >
          <LogOut size={18} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

/** Troca de página suave; o foco vai para o conteúdo novo (bom para teclado e leitor de tela). */
function TransicaoPagina() {
  const { pathname } = useLocation();
  const menos = useMenosMovimento();
  // Compara com a tela anterior (e não com "primeira vez"): o StrictMode roda o efeito
  // duas vezes, e o foco pulava para o conteúdo já na abertura, passando por cima do
  // link "Pular para o conteúdo".
  const anterior = useRef(pathname);
  useEffect(() => {
    if (anterior.current === pathname) return;
    anterior.current = pathname;
    document.getElementById("conteudo")?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }, [pathname]);
  return (
    <m.div
      key={pathname}
      className="pagina"
      initial={menos ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.24, ease: [0.2, 0.7, 0.2, 1] }}
    >
      <Outlet />
    </m.div>
  );
}

function MenuMovel({ aberto, aoFechar }: { readonly aberto: boolean; readonly aoFechar: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (aberto && !el.open) el.showModal();
    if (!aberto && el.open) el.close();
  }, [aberto]);
  return (
    // eslint-disable-next-line jsx-a11y-x/click-events-have-key-events, jsx-a11y-x/no-noninteractive-element-interactions -- clicar no fundo fecha; pelo teclado, Esc fecha (onCancel)
    <dialog
      ref={ref}
      className="gaveta"
      aria-label="Menu"
      onCancel={(e) => {
        e.preventDefault();
        aoFechar();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) aoFechar();
      }}
    >
      {aberto ? (
        <div className="gaveta__corpo">
          <div className="lateral__marca">
            <Marca tamanho={28} />
          </div>
          <div className="lateral__rolagem">
            <Navegacao aoNavegar={aoFechar} />
          </div>
          <RodapeLateral />
        </div>
      ) : null}
    </dialog>
  );
}
