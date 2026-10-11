import { Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { LogOut } from "lucide-react";
import { m } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useFonte } from "../api/contexto";
import { mensagemDe } from "../api/erros";
import { useAvisos } from "../componentes/Avisos";
import { Marca } from "../componentes/Marca";
import { useSessao } from "../ganchos/consultas";
import { useSair } from "../ganchos/mutacoes";
import { useMenosMovimento } from "../ganchos/movimento";
import { useTempoReal } from "../ganchos/useTempoReal";
import { useTema } from "../lib/tema";
import { AvisoDemo } from "./AvisoDemo";
import { BarraTopo } from "./BarraTopo";
import { Navegacao } from "./Navegacao";

/** A moldura de todas as telas depois de entrar: menu, barra de status e a página. */
export function Casca() {
  const fonte = useFonte();
  const tema = useTema();
  const [menuAberto, setMenuAberto] = useState(false);
  useTempoReal();

  return (
    <div className="app">
      <a className="pular-para-conteudo" href="#conteudo">
        Pular para o conteúdo
      </a>
      {fonte.demo ? <AvisoDemo /> : null}
      <div className="app__grade">
        <aside className="lateral">
          <div className="lateral__marca">
            <Marca tamanho={30} />
          </div>
          <Navegacao />
          <RodapeLateral />
        </aside>
        <div className="principal">
          <BarraTopo tema={tema} abrirMenu={() => setMenuAberto(true)} />
          <main id="conteudo" className="conteudo" tabIndex={-1}>
            <TransicaoPagina />
          </main>
        </div>
      </div>
      <MenuMovel aberto={menuAberto} aoFechar={() => setMenuAberto(false)} />
    </div>
  );
}

function RodapeLateral() {
  const usuario = useSessao().data;
  const sair = useSair();
  const navegar = useNavigate();
  const avisar = useAvisos();
  return (
    <div className="lateral__rodape">
      <p className="lateral__usuario" title={usuario?.email}>
        {usuario?.nome ?? usuario?.email}
      </p>
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
        <LogOut size={17} aria-hidden="true" />
      </button>
    </div>
  );
}

/** Troca de página suave; o foco vai para o conteúdo novo (bom para teclado e leitor de tela). */
function TransicaoPagina() {
  const { pathname } = useLocation();
  const menos = useMenosMovimento();
  const primeira = useRef(true);
  useEffect(() => {
    if (primeira.current) {
      primeira.current = false;
      return;
    }
    document.getElementById("conteudo")?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }, [pathname]);
  return (
    <m.div
      key={pathname}
      className="pagina"
      initial={menos ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: [0.2, 0.7, 0.2, 1] }}
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
          <Navegacao aoNavegar={aoFechar} />
          <RodapeLateral />
        </div>
      ) : null}
    </dialog>
  );
}
