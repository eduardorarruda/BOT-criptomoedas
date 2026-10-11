import { m } from "motion/react";
import { useMenosMovimento } from "../../ganchos/movimento";
import { formatarPercentual } from "../../lib/formatar";
import { arco, posicionar } from "../carteira/alocacao";
import type { FatiaClasse } from "./composicao";

const TAMANHO = 180;
const CENTRO = TAMANHO / 2;
const RAIO = 70;
/** Respiro entre fatias, em fração da volta. */
const RESPIRO = 0.004;

/**
 * Donut da composição (fatia de cada classe no total), com a geometria do donut da
 * carteira. Cada arco se desenha em sequência, como a pincelada do Ensō; com "menos
 * movimento", aparece pronto. A legenda repete tudo em texto: a cor nunca é a única pista.
 */
export function GraficoComposicao({ fatias }: { readonly fatias: readonly FatiaClasse[] }) {
  const menos = useMenosMovimento();
  const respiro = fatias.length > 1 ? RESPIRO : 0;
  const desenhos = posicionar(fatias).map((f, i) => ({
    ...f,
    i,
    classe: fatias[i]?.classe,
    d: arco(CENTRO, CENTRO, RAIO, f.inicio, Math.max(f.inicio, f.fim - respiro)),
  }));
  const resumo = fatias.map((f) => `${f.rotulo} ${formatarPercentual(f.fracao)}`).join(", ");
  return (
    <figure className="patrimonio-donut">
      <svg
        viewBox={`0 0 ${TAMANHO} ${TAMANHO}`}
        role="img"
        aria-label={`Composição do patrimônio: ${resumo}`}
      >
        <circle cx={CENTRO} cy={CENTRO} r={RAIO} className="patrimonio-donut__fundo" />
        {desenhos.map((f) => (
          <m.path
            key={f.classe}
            d={f.d}
            className={`patrimonio-donut__fatia patrimonio-cor--${f.classe}`}
            initial={menos ? false : { pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.7, delay: f.i * 0.14, ease: [0.16, 1, 0.3, 1] }}
          />
        ))}
      </svg>
      <figcaption>
        <ul role="list" className="patrimonio-legenda">
          {fatias.map((f) => (
            <li key={f.classe}>
              <span className={`patrimonio-legenda__cor patrimonio-cor--${f.classe}`} aria-hidden="true" />
              <span>{f.rotulo}</span>
              <span className="num">{formatarPercentual(f.fracao)}</span>
            </li>
          ))}
        </ul>
      </figcaption>
    </figure>
  );
}
