import { AnimatePresence, m } from "motion/react";
import { useCallback, useRef, useState, type KeyboardEvent } from "react";
import { useFonte } from "../../api/contexto";
import { Cabecalho } from "../../componentes/Cabecalho";
import { useFiltrosUrl } from "../../componentes/filtros";
import { useMenosMovimento } from "../../ganchos/movimento";
import { Cadastro } from "./Cadastro";
import { Conectar } from "./Conectar";
import { Detalhe } from "./Detalhe";
import { buscaRendaFixa, NAO_CONTAM, type Aba, type BuscaRendaFixa } from "./filtros";
import { RegrasEmVigor } from "./Fontes";
import { Simuladores } from "./Simuladores";
import { Titulos } from "./Titulos";
import { Visao } from "./Visao";
// Os cartões vêm antes: as regras de tela pequena em renda-fixa.css precisam vencer.
import "./renda-fixa-cartoes.css";
import "./renda-fixa.css";
import "./renda-fixa-visoes.css";

export type { Aba } from "./filtros";

const ABAS: readonly { readonly id: Aba; readonly rotulo: string }[] = [
  { id: "visao", rotulo: "Visão geral" },
  { id: "titulos", rotulo: "Títulos" },
  { id: "conectar", rotulo: "Conectar banco" },
  { id: "cadastrar", rotulo: "Cadastrar" },
  { id: "simuladores", rotulo: "Simuladores" },
];

/** Abas com teclado: setas andam, Home e End vão às pontas (padrão WAI-ARIA). */
function Abas({ ativa, aoMudar }: { readonly ativa: Aba; readonly aoMudar: (a: Aba) => void }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const mover = (e: KeyboardEvent, i: number) => {
    const destino = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: ABAS.length - 1 }[e.key];
    if (destino === undefined) return;
    e.preventDefault();
    const j = (destino + ABAS.length) % ABAS.length;
    const alvo = ABAS[j];
    if (!alvo) return;
    aoMudar(alvo.id);
    refs.current[j]?.focus();
  };
  return (
    <div className="rf-abas" role="tablist" aria-label="Seções da renda fixa">
      {ABAS.map((a, i) => (
        <button
          key={a.id}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          role="tab"
          id={`rf-aba-${a.id}`}
          aria-selected={ativa === a.id}
          aria-controls="rf-painel"
          tabIndex={ativa === a.id ? 0 : -1}
          className="rf-abas__aba"
          onClick={() => aoMudar(a.id)}
          onKeyDown={(e) => mover(e, i)}
        >
          {a.rotulo}
          {ativa === a.id ? (
            <m.span layoutId="rf-abas-marca" className="rf-abas__marca" aria-hidden="true" />
          ) : null}
        </button>
      ))}
    </div>
  );
}

export function RendaFixa() {
  const { demo } = useFonte();
  // A aba fica na URL: "/renda-fixa?aba=titulos&visao=escada" abre direto na escada de vencimentos.
  const { busca, mudar } = useFiltrosUrl(buscaRendaFixa, NAO_CONTAM);
  const aba = busca.aba ?? "visao";
  const setAba = useCallback(
    (a: Aba, extra: BuscaRendaFixa = {}) => mudar({ ...extra, aba: a === "visao" ? undefined : a }),
    [mudar],
  );
  const [aberto, setAberto] = useState<string | null>(null);
  const menos = useMenosMovimento();
  return (
    <>
      <Cabecalho titulo="Renda fixa" abas={<Abas ativa={aba} aoMudar={(a) => setAba(a)} />}>
        CDB, Tesouro, LCI/LCA, debêntures, poupança e caixinhas: quanto vale hoje, quanto de imposto sai e
        quanto sobra. Fatos e contas com fonte e data. Nada aqui é recomendação.
      </Cabecalho>
      <AnimatePresence mode="wait" initial={false}>
        <m.div
          key={aba}
          id="rf-painel"
          role="tabpanel"
          aria-labelledby={`rf-aba-${aba}`}
          className="rf-painel"
          initial={menos ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={menos ? { opacity: 1 } : { opacity: 0, y: -4 }}
          transition={{ duration: menos ? 0 : 0.18 }}
        >
          {aba === "visao" ? <Visao irPara={setAba} abrir={setAberto} demo={demo} /> : null}
          {aba === "titulos" ? <Titulos irPara={setAba} abrir={setAberto} /> : null}
          {aba === "conectar" ? <Conectar demo={demo} /> : null}
          {aba === "cadastrar" ? <Cadastro aoCriar={setAberto} /> : null}
          {aba === "simuladores" ? <Simuladores /> : null}
        </m.div>
      </AnimatePresence>
      <RegrasEmVigor />
      <Detalhe key={aberto ?? "fechado"} id={aberto} aoFechar={() => setAberto(null)} />
    </>
  );
}
