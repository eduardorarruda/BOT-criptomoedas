import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Indicadores (KPIs) em cartões. A grade é uma <dl>: cada cartão é um par
 * rótulo/valor, que o leitor de tela lê junto. O valor costuma ser <Dinheiro> ou
 * <NumeroAnimado>; `grafico` recebe um <Minigrafico> (decorativo).
 *
 * `variacao` é uma linha curta depois do valor ("+2,4% em 30 dias") com tom de
 * ganho/perda; o texto diz o sinal, a cor só reforça.
 */
export type TomKpi = "ganho" | "perda" | "atencao" | "neutro";

export function GradeKpi({
  children,
  rotulo,
  colunas,
  className = "",
}: {
  readonly children: ReactNode;
  /** Nome do grupo para leitores de tela ("Resumo do dia"). */
  readonly rotulo?: string;
  /** Força o número de colunas no computador (padrão: automático). */
  readonly colunas?: number;
  readonly className?: string;
}) {
  return (
    <dl
      className={`grade-kpi ${colunas ? `grade-kpi--${colunas}` : ""} ${className}`.trim()}
      aria-label={rotulo}
    >
      {children}
    </dl>
  );
}

export function CartaoKpi({
  rotulo,
  valor,
  nota,
  variacao,
  tomVariacao = "neutro",
  icone: Icone,
  grafico,
  destaque = false,
  tom,
}: {
  readonly rotulo: string;
  readonly valor: ReactNode;
  readonly nota?: ReactNode;
  readonly variacao?: ReactNode;
  readonly tomVariacao?: TomKpi;
  readonly icone?: LucideIcon;
  readonly grafico?: ReactNode;
  /** O indicador principal da faixa: número maior, ocupa mais espaço. */
  readonly destaque?: boolean;
  /** Tinge a borda do cartão (ex.: "atencao" quando algo pede olhar). */
  readonly tom?: TomKpi;
}) {
  const classes = ["kpi", destaque ? "kpi--destaque" : "", tom ? `kpi--${tom}` : ""]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={classes}>
      <dt className="kpi__rotulo">
        {Icone ? <Icone size={14} strokeWidth={1.9} aria-hidden="true" /> : null}
        {rotulo}
      </dt>
      <dd className="kpi__valor">{valor}</dd>
      {variacao ? <dd className={`kpi__variacao kpi__variacao--${tomVariacao}`}>{variacao}</dd> : null}
      {nota ? <dd className="kpi__nota">{nota}</dd> : null}
      {grafico ? (
        <dd className="kpi__grafico" aria-hidden="true">
          {grafico}
        </dd>
      ) : null}
    </div>
  );
}
