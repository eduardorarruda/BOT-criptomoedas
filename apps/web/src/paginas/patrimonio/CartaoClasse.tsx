import type { ClassePatrimonio, ClassePatrimonioResumo } from "@zentrade/contratos/esquemas";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Building2, Landmark, TriangleAlert, Wallet, type LucideIcon } from "lucide-react";
import { m } from "motion/react";
import { Selo } from "../../componentes/Selo";
import { useMenosMovimento } from "../../ganchos/movimento";
import { formatarPercentual, TRACO } from "../../lib/formatar";
import { formatarRelativo } from "../../lib/tempo";
import { reais } from "../renda-fixa/formato";
import { descreverItens, ROTA_CLASSE, ROTULO_CLASSE, SITUACAO, valorDaClasse } from "./composicao";

const ICONE: Record<ClassePatrimonio, LucideIcon> = {
  cripto: Wallet,
  renda_fixa: Landmark,
  imobiliario: Building2,
};

const LINK: Record<ClassePatrimonio, string> = {
  cripto: "Ver a carteira cripto",
  renda_fixa: "Ver a renda fixa",
  imobiliario: "Ver o imobiliário",
};

/** O que cada classe soma, em uma frase, para ninguém comparar coisas diferentes sem saber. */
const O_QUE_ENTRA: Record<ClassePatrimonio, string> = {
  cripto: "Conta real da Binance inteira, inclusive USDT. O custo fica em USDT, na Carteira.",
  renda_fixa: "Valor bruto de hoje, antes de IR e IOF.",
  imobiliario: "Valor atual menos a dívida do financiamento.",
};

/** Um cartão por classe: quanto vale, que fatia é, quando foi atualizada e o caminho para o detalhe. */
export function CartaoClasse({
  c,
  ordem,
  fracao = c.fracao,
  fora = false,
}: {
  readonly c: ClassePatrimonioResumo;
  readonly ordem: number;
  /** Fatia na soma escolhida (por padrão, a do total da API). */
  readonly fracao?: string | null;
  /** A classe ficou fora da soma escolhida: o cartão fica, apagado. */
  readonly fora?: boolean;
}) {
  const menos = useMenosMovimento();
  const Icone = ICONE[c.classe];
  const situacao = SITUACAO[c.situacao];
  const id = `patrimonio-classe-${c.classe}`;
  return (
    <m.li
      className={`patrimonio-classe patrimonio-classe--${c.classe} ${fora ? "patrimonio-classe--fora" : ""}`}
      aria-labelledby={id}
      initial={menos ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.08 * ordem, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="patrimonio-classe__topo">
        <span className={`patrimonio-classe__marca patrimonio-cor--${c.classe}`} aria-hidden="true">
          <Icone size={17} strokeWidth={1.8} />
        </span>
        <h2 className="patrimonio-classe__titulo" id={id}>
          {ROTULO_CLASSE[c.classe]}
        </h2>
        {fora ? <Selo tom="neutro">Fora desta soma</Selo> : <Selo tom={situacao.tom}>{situacao.texto}</Selo>}
      </div>
      <p className="patrimonio-classe__valor num">{valorDaClasse(c)}</p>
      <dl className="patrimonio-classe__dados">
        <div>
          <dt>Fatia do total</dt>
          <dd className="num">{fora || fracao === null ? TRACO : formatarPercentual(fracao)}</dd>
        </div>
        <div>
          <dt>Investido</dt>
          <dd className="num">{c.investido === null ? TRACO : reais(c.investido)}</dd>
        </div>
        <div>
          <dt>Itens</dt>
          <dd>{descreverItens(c.classe, c.itens)}</dd>
        </div>
        <div>
          <dt>Atualizado</dt>
          <dd>{c.atualizadoEm === null ? TRACO : formatarRelativo(c.atualizadoEm)}</dd>
        </div>
      </dl>
      <p className="patrimonio-classe__nota">{O_QUE_ENTRA[c.classe]}</p>
      {c.avisos.map((a) => (
        <p key={a} className="patrimonio-aviso">
          <TriangleAlert size={14} aria-hidden="true" className="atencao" /> {a}
        </p>
      ))}
      <Link
        to={ROTA_CLASSE[c.classe]}
        className="botao botao--secundario botao--pequeno patrimonio-classe__link"
      >
        {LINK[c.classe]}
        <ArrowRight size={15} aria-hidden="true" />
      </Link>
    </m.li>
  );
}
