import { Activity, History, Landmark, ListTree, Newspaper, Search, type LucideIcon } from "lucide-react";
import { AnimatePresence, m } from "motion/react";
import type { RoboDTO } from "@zentrade/contratos";
import type { AnaliseAoVivo } from "../../ganchos/atualizarCache";
import { formatarHora } from "../../lib/tempo";
import { Enso } from "../Enso";

/**
 * Cartão "pensando": cada ferramenta que o agente consulta aparece na hora, em
 * ordem. Quando a análise termina, ele avisa e a decisão entra logo abaixo.
 */
const FERRAMENTA: Record<string, { readonly rotulo: string; readonly icone: LucideIcon }> = {
  conferir_regra: { rotulo: "Regra", icone: ListTree },
  buscar_casos_parecidos: { rotulo: "Diário", icone: History },
  ler_noticias: { rotulo: "Notícias", icone: Newspaper },
  consultar_regras_corretora: { rotulo: "Corretora", icone: Landmark },
  medir_volatilidade: { rotulo: "Volatilidade", icone: Activity },
};
const PADRAO = { rotulo: "Consulta", icone: Search };

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
      {analise.concluida ? (
        <p className="pensando__fim">O risco já avaliou a proposta. A decisão está logo abaixo.</p>
      ) : null}
    </article>
  );
}
