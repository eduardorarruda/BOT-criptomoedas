import { m } from "motion/react";
import { useId, useState } from "react";
import { useMenosMovimento } from "../../../ganchos/movimento";
import { corDa, type Serie } from "./comum";

/**
 * Alocação em rosca: cada fatia é um arco que se desenha em sequência, como uma
 * pincelada do Ensō. Até 5 fatias com cor; o resto vira "Outros". A legenda ao
 * lado traz nome, valor e percentual — a cor nunca é a única pista.
 */
export interface Fatia {
  readonly nome: string;
  readonly valor: number;
  readonly texto: string;
}

interface Props {
  readonly titulo: string;
  readonly fatias: readonly Fatia[];
  readonly centro: string;
  readonly legendaCentro: string;
}

const RAIO = 70;
const ESPESSURA = 18;
const CIRCUNFERENCIA = 2 * Math.PI * RAIO;
const MAXIMO_FATIAS = 5;
const LACUNA = 3;

function agrupar(fatias: readonly Fatia[]): Fatia[] {
  const positivas = fatias.filter((f) => f.valor > 0);
  if (positivas.length <= MAXIMO_FATIAS) return positivas;
  const resto = positivas.slice(MAXIMO_FATIAS - 1);
  const soma = resto.reduce((s, f) => s + f.valor, 0);
  return [
    ...positivas.slice(0, MAXIMO_FATIAS - 1),
    { nome: "Outros", valor: soma, texto: `${resto.length} tipos` },
  ];
}

const pct = (fracao: number) => `${(fracao * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
const corDaFatia = (i: number) => corDa({ cor: (i + 1) as Serie["cor"] });

interface Arco {
  readonly fatia: Fatia;
  readonly inicio: number;
  readonly comprimento: number;
}

/** Onde cada arco começa e quanto mede (com uma lacuna entre fatias). */
function arcos(grupos: readonly Fatia[]): Arco[] {
  const total = grupos.reduce((s, f) => s + f.valor, 0) || 1;
  const lacuna = grupos.length > 1 ? LACUNA : 0;
  return grupos.map((fatia, i) => {
    const antes = grupos.slice(0, i).reduce((s, f) => s + f.valor, 0);
    return {
      fatia,
      inicio: (antes / total) * CIRCUNFERENCIA,
      comprimento: Math.max(0, (fatia.valor / total) * CIRCUNFERENCIA - lacuna),
    };
  });
}

function Arcos({ lista, ativa }: { readonly lista: readonly Arco[]; readonly ativa: string | null }) {
  const menos = useMenosMovimento();
  return (
    <>
      {lista.map((a, i) => (
        <m.circle
          key={a.fatia.nome}
          cx={90}
          cy={90}
          r={RAIO}
          fill="none"
          stroke={corDaFatia(i)}
          strokeWidth={ativa === a.fatia.nome ? ESPESSURA + 4 : ESPESSURA}
          transform="rotate(-90 90 90)"
          strokeDashoffset={-a.inicio}
          initial={menos ? false : { strokeDasharray: `0 ${CIRCUNFERENCIA}` }}
          animate={{ strokeDasharray: `${a.comprimento} ${CIRCUNFERENCIA}` }}
          transition={{ duration: 0.6, ease: [0.2, 0.7, 0.2, 1], delay: i * 0.15 }}
        />
      ))}
    </>
  );
}

export function Rosca({ titulo, fatias, centro, legendaCentro }: Props) {
  const id = useId();
  const [ativa, setAtiva] = useState<string | null>(null);
  const grupos = agrupar(fatias);
  const total = grupos.reduce((s, f) => s + f.valor, 0) || 1;
  return (
    <figure className="imob-rosca" aria-labelledby={`${id}-titulo`}>
      <figcaption id={`${id}-titulo`} className="so-leitor">
        {titulo}: {grupos.map((f) => `${f.nome} ${pct(f.valor / total)}`).join(", ")}
      </figcaption>
      <svg viewBox="0 0 180 180" className="imob-rosca__svg" aria-hidden="true">
        <circle cx={90} cy={90} r={RAIO} className="imob-rosca__trilho" strokeWidth={ESPESSURA} fill="none" />
        <Arcos lista={arcos(grupos)} ativa={ativa} />
        <text x={90} y={86} textAnchor="middle" className="imob-rosca__centro num">
          {centro}
        </text>
        <text x={90} y={106} textAnchor="middle" className="imob-rosca__legenda-centro">
          {legendaCentro}
        </text>
      </svg>
      <ul className="imob-rosca__lista" role="list">
        {grupos.map((f, i) => (
          <li
            key={f.nome}
            onPointerEnter={() => setAtiva(f.nome)}
            onPointerLeave={() => setAtiva(null)}
            className={ativa === f.nome ? "imob-rosca__item--ativo" : undefined}
          >
            <span className="imob-legenda__marca" style={{ background: corDaFatia(i) }} aria-hidden="true" />
            <span className="imob-rosca__nome">{f.nome}</span>
            <span className="num imob-rosca__valor">{f.texto}</span>
            <span className="num apagado">{pct(f.valor / total)}</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}
