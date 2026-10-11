import type { PropostaAgente } from "@zentrade/contratos";
import {
  BookOpen,
  FileText,
  Landmark,
  Newspaper,
  NotebookPen,
  StickyNote,
  type LucideIcon,
} from "lucide-react";
import { formatarPercentual, formatarPreco } from "../../lib/formatar";

/** O argumento da IA: justificativa, confiança, tamanho pedido, riscos e fontes. */
const ICONE_FONTE: Record<PropostaAgente["fontes"][number]["tipo"], LucideIcon> = {
  diario: NotebookPen,
  noticia: Newspaper,
  regra_corretora: Landmark,
  estrategia: BookOpen,
  nota: StickyNote,
};

export function Proposta({ proposta: p }: { readonly proposta: PropostaAgente }) {
  const confianca = Math.round(p.confianca * 100);
  return (
    <section className="decisao__bloco">
      <h3 className="decisao__subtitulo">O que a IA argumentou</h3>
      <p className="decisao__justificativa">{p.justificativa}</p>
      <div className="decisao__medidores">
        <div className="medidor">
          <span className="medidor__rotulo">Confiança</span>
          <span
            className="medidor__barra"
            role="meter"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={confianca}
            aria-label="Confiança da IA"
          >
            <span style={{ width: `${confianca}%` }} />
          </span>
          <span className="num">{formatarPercentual(p.confianca, { casas: 0 })}</span>
        </div>
        <p className="apagado">
          Tamanho pedido: <span className="num">{formatarPercentual(p.tamanhoRelativo, { casas: 0 })}</span>{" "}
          do que o risco permite
          {p.stop ? (
            <>
              {" "}
              · stop <span className="num">{formatarPreco(p.stop)}</span>
            </>
          ) : null}
          {p.alvo ? (
            <>
              {" "}
              · alvo <span className="num">{formatarPreco(p.alvo)}</span>
            </>
          ) : null}
        </p>
      </div>
      {p.riscos.length || p.fontes.length ? (
        <details className="decisao__detalhes">
          <summary>
            {p.riscos.length} {p.riscos.length === 1 ? "risco apontado" : "riscos apontados"} ·{" "}
            {p.fontes.length} {p.fontes.length === 1 ? "fonte" : "fontes"}
          </summary>
          {p.riscos.length ? (
            <ul role="list" className="decisao__riscos">
              {p.riscos.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          ) : null}
          {p.fontes.length ? (
            <ul role="list" className="decisao__fontes">
              {p.fontes.map((f) => {
                const Icone = ICONE_FONTE[f.tipo] ?? FileText;
                return (
                  <li key={f.id}>
                    <Icone size={14} aria-hidden="true" />
                    <span>{f.titulo}</span>
                    {f.data ? <span className="num apagado">{f.data}</span> : null}
                  </li>
                );
              })}
            </ul>
          ) : null}
        </details>
      ) : null}
    </section>
  );
}
