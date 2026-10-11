import { Activity, History, Landmark, ListTree, Newspaper, Search, type LucideIcon } from "lucide-react";
import { AnimatePresence, m } from "motion/react";
import type { RoboDTO } from "@zentrade/contratos/esquemas";
import type { AnaliseAoVivo } from "../../ganchos/atualizarCache";
import { formatarHora } from "../../lib/tempo";
import { Enso } from "../Enso";

/**
 * Cartão "pensando": cada ferramenta que o agente consulta aparece na hora, em
 * ordem. Quando a análise termina, ele avisa e a decisão entra logo abaixo.
 */
const FERRAMENTA: Record<string, { readonly rotulo: string; readonly icone: LucideIcon }> = {
  // ferramentas do apps/agente
  retrato_mercado: { rotulo: "Mercado", icone: Activity },
  buscar_conhecimento: { rotulo: "Conhecimento", icone: Newspaper },
  historico_decisoes: { rotulo: "Diário", icone: History },
  posicao_e_orcamento: { rotulo: "Orçamento", icone: Landmark },
  // roteiro do modo de demonstração
  conferir_regra: { rotulo: "Regra", icone: ListTree },
  buscar_casos_parecidos: { rotulo: "Diário", icone: History },
  ler_noticias: { rotulo: "Notícias", icone: Newspaper },
  consultar_regras_corretora: { rotulo: "Corretora", icone: Landmark },
  medir_volatilidade: { rotulo: "Volatilidade", icone: Activity },
};
const PADRAO = { rotulo: "Consulta", icone: Search };

const FIM = {
  comprar: { texto: "Propôs comprar. O risco tem a palavra final.", classe: "" },
  vender: { texto: "Propôs vender. O risco tem a palavra final.", classe: "" },
  aguardar: { texto: "Propôs aguardar: nenhuma ordem sai desta análise.", classe: "" },
  falhou: { texto: "A análise falhou. Sem ela, o robô não opera.", classe: "pensando__fim--falhou" },
} as const;

function Fim({ resultado }: { readonly resultado: AnaliseAoVivo["resultado"] }) {
  const f = resultado ? FIM[resultado] : null;
  return (
    <p className={`pensando__fim ${f?.classe ?? ""}`}>
      {f?.texto ?? "Análise entregue ao risco, que tem a palavra final."}
    </p>
  );
}

export function Pensando({
  analise,
  robo,
}: {
  readonly analise: AnaliseAoVivo;
  readonly robo: RoboDTO | undefined;
}) {
  return (
    <article
      className={`pensando ${analise.concluida ? "pensando--pronto" : ""}`}
      aria-busy={!analise.concluida}
      aria-label={`Análise de ${robo?.nome ?? "robô"}`}
    >
      <header className="pensando__topo">
        <Enso tamanho={22} className={analise.concluida ? "" : "respirar"} />
        <p>
          <strong>{analise.concluida ? "Análise concluída" : "Analisando agora"}</strong>
          <span className="apagado">
            {" "}
            · {robo?.nome ?? "robô"} · {robo?.simbolo}
          </span>
        </p>
      </header>
      <ol role="list" className="pensando__etapas" aria-live="polite">
        <AnimatePresence initial={false}>
          {analise.etapas.map((etapa, i) => {
            const f = FERRAMENTA[etapa.ferramenta] ?? PADRAO;
            const Icone = f.icone;
            return (
              <m.li
                key={`${etapa.ferramenta}-${i}`}
                className="pensando__etapa"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, ease: [0.2, 0.7, 0.2, 1] }}
              >
                <span className="pensando__ferramenta">
                  <Icone size={14} aria-hidden="true" />
                  {f.rotulo}
                </span>
                <span className="pensando__descricao">{etapa.descricao}</span>
                <time className="num apagado" dateTime={new Date(etapa.em).toISOString()}>
                  {formatarHora(etapa.em)}
                </time>
              </m.li>
            );
          })}
        </AnimatePresence>
        {!analise.concluida ? (
          <li className="pensando__etapa pensando__etapa--esperando">
            <span className="pensando__ferramenta">
              <Search size={14} aria-hidden="true" />…
            </span>
            <span className="esqueleto__linha" style={{ width: "60%" }} />
          </li>
        ) : null}
      </ol>
      {analise.concluida ? <Fim resultado={analise.resultado} /> : null}
    </article>
  );
}
