import type { MoedaCarteira } from "@zentrade/contratos/esquemas";
import { m } from "motion/react";
import { useMenosMovimento } from "../../ganchos/movimento";
import { formatarPercentual } from "../../lib/formatar";
import { arco, fatiasDaAlocacao, posicionar } from "./alocacao";

const TAMANHO = 180;
const CENTRO = TAMANHO / 2;
const RAIO = 70;
/** Respiro entre fatias, em fração da volta. */
const RESPIRO = 0.004;

/**
 * Donut da alocação (fatia do valor da conta por moeda). Cada fatia se desenha em
 * sequência; com "menos movimento" pedido, aparece pronta. A legenda repete tudo em
 * texto: a cor nunca é a única pista.
 */
export function GraficoAlocacao({ moedas }: { readonly moedas: readonly MoedaCarteira[] }) {
  const menos = useMenosMovimento();
  const fatias = fatiasDaAlocacao(moedas);
  const respiro = fatias.length > 1 ? RESPIRO : 0;
  const desenhos = posicionar(fatias).map((f, i) => ({
    ...f,
    i,
    d: arco(CENTRO, CENTRO, RAIO, f.inicio, Math.max(f.inicio, f.fim - respiro)),
  }));
  const resumo = fatias.map((f) => `${f.rotulo} ${formatarPercentual(f.fracao)}`).join(", ");
  return (
    <figure className="carteira-donut">
      <svg
        viewBox={`0 0 ${TAMANHO} ${TAMANHO}`}
        role="img"
        aria-label={`Alocação da conta: ${resumo || "sem dados"}`}
      >
        <circle cx={CENTRO} cy={CENTRO} r={RAIO} className="carteira-donut__fundo" />
        {desenhos.map((f) => (
          <m.path
            key={f.rotulo}
            d={f.d}
            className={`carteira-donut__fatia carteira-cor-${f.i}`}
            initial={menos ? false : { pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.6, delay: f.i * 0.12, ease: [0.16, 1, 0.3, 1] }}
          />
        ))}
      </svg>
      <figcaption>
        <ul role="list" className="carteira-legenda">
          {fatias.map((f, i) => (
            <li key={f.rotulo}>
              <span className={`carteira-legenda__cor carteira-cor-${i}`} aria-hidden="true" />
              <span>{f.rotulo}</span>
              <span className="num">{formatarPercentual(f.fracao)}</span>
            </li>
          ))}
        </ul>
      </figcaption>
    </figure>
  );
}
