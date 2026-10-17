import { useNavigate } from "@tanstack/react-router";
import { lazy, Suspense, useMemo, useState } from "react";
import { SemQuebrar } from "../componentes/SemQuebrar";
import { useSessao } from "../ganchos/consultas";
import type { ControleMenu } from "../lib/menuRecolhido";
import type { ControleTema } from "../lib/tema";
import { definirComeceAquiOculto, EVENTO_COMECE_AQUI } from "../paginas/visao/useComeceAqui";
import { ATALHOS_IR, comandosDeNavegacao, type Comando } from "./comandos";
import { NAVEGACAO, type RotaApp } from "./navegacao";
import { useAtalhosGlobais } from "./useAtalhosGlobais";

/** A paleta e a ajuda chegam só quando abrem pela primeira vez (não pesam na abertura). */
const Paleta = lazy(() => import("./Paleta").then((m) => ({ default: m.Paleta })));
const AjudaAtalhos = lazy(() => import("./AjudaAtalhos").then((m) => ({ default: m.AjudaAtalhos })));

const IR_PARA: readonly (readonly [string, string])[] = Object.entries(ATALHOS_IR).map(([letra, para]) => [
  NAVEGACAO.flatMap((g) => g.itens).find((i) => i.para === para)?.rotulo ?? para,
  letra,
]);

export interface ControleComandos {
  readonly abrirPaleta: () => void;
}

/**
 * Teclado de qualquer tela: a paleta de comandos, a ajuda de atalhos e o "g + letra".
 * Fica na casca; devolve como abrir a paleta (o botão da barra de cima usa).
 */
export function useComandosGlobais({
  tema,
  menu,
}: {
  readonly tema: ControleTema;
  readonly menu: ControleMenu;
}): { readonly controle: ControleComandos; readonly elementos: React.ReactNode } {
  const navegar = useNavigate();
  const usuario = useSessao().data;
  const [paleta, setPaleta] = useState(false);
  const [ajuda, setAjuda] = useState(false);
  const [usou, setUsou] = useState({ paleta: false, ajuda: false });

  const abrirPaleta = (): void => {
    setUsou((u) => ({ ...u, paleta: true }));
    setPaleta(true);
  };
  const abrirAjuda = (): void => {
    setUsou((u) => ({ ...u, ajuda: true }));
    setAjuda(true);
  };
  const ir = (para: RotaApp): void => void navegar({ to: para });
  useAtalhosGlobais({ abrirPaleta, abrirAjuda, navegar: ir });

  const claro = tema.tema === "claro";
  const comandos = useMemo<Comando[]>(
    () => [
      ...comandosDeNavegacao((para) => void navegar({ to: para })),
      {
        id: "tema",
        titulo: claro ? "Usar o tema escuro" : "Usar o tema claro",
        grupo: "Ações",
        palavras: "aparencia cor modo noturno",
        executar: tema.alternar,
      },
      {
        id: "menu",
        titulo: menu.recolhido ? "Expandir o menu lateral" : "Recolher o menu lateral",
        grupo: "Ações",
        palavras: "barra lateral navegacao",
        executar: menu.alternar,
      },
      {
        id: "comece-aqui",
        titulo: "Mostrar os primeiros passos",
        grupo: "Ações",
        palavras: "comece aqui onboarding ajuda inicio",
        executar: () => {
          if (usuario) definirComeceAquiOculto(usuario.id, false);
          window.dispatchEvent(new Event(EVENTO_COMECE_AQUI));
          void navegar({ to: "/" });
        },
      },
      {
        id: "atalhos",
        titulo: "Ver os atalhos do teclado",
        grupo: "Ações",
        palavras: "teclas ajuda",
        atalho: "?",
        executar: () => {
          setUsou((u) => ({ ...u, ajuda: true }));
          setAjuda(true);
        },
      },
    ],
    [claro, tema.alternar, menu.recolhido, menu.alternar, navegar, usuario],
  );

  const elementos = (
    <SemQuebrar>
      <Suspense fallback={null}>
        {usou.paleta ? (
          <Paleta aberta={paleta} comandos={comandos} aoFechar={() => setPaleta(false)} />
        ) : null}
        {usou.ajuda ? (
          <AjudaAtalhos aberta={ajuda} aoFechar={() => setAjuda(false)} irPara={IR_PARA} />
        ) : null}
      </Suspense>
    </SemQuebrar>
  );
  return { controle: { abrirPaleta }, elementos };
}
