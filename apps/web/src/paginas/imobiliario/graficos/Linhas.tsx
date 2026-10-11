import { m } from "motion/react";
import { useId, useState, type PointerEvent } from "react";
import { useMenosMovimento } from "../../../ganchos/movimento";
import {
  corDa,
  Dica,
  EixoY,
  escala,
  indicePeloPonteiro,
  LARGURA,
  Legenda,
  MARGEM,
  Sensor,
  TabelaDados,
  type Serie,
} from "./comum";

/**
 * Linhas no tempo (saldo devedor, patrimônio, renda). A linha se desenha da esquerda
 * para a direita uma vez — mostra que é uma evolução — e fica parada com menos movimento.
 * Passar o ponteiro (ou o dedo) mostra a dica com todos os valores do ponto.
 */
interface Props {
  readonly titulo: string;
  readonly descricao: string;
  readonly rotulos: readonly string[];
  readonly series: readonly Serie[];
  readonly formatar: (v: number) => string;
  readonly formatarEixo: (v: number) => string;
  readonly altura?: number;
}

const UTIL = LARGURA - MARGEM.esquerda - MARGEM.direita;
const xDoPonto = (i: number, total: number) => MARGEM.esquerda + (i * UTIL) / Math.max(1, total - 1);

function caminho(valores: readonly number[], y: (v: number) => number): string {
  return valores
    .map((v, i) => `${i === 0 ? "M" : "L"}${xDoPonto(i, valores.length).toFixed(1)},${y(v).toFixed(1)}`)
    .join(" ");
}

function Tracos({ series, y }: { readonly series: readonly Serie[]; readonly y: (v: number) => number }) {
  const menos = useMenosMovimento();
  return (
    <>
      {series.map((s, k) => (
        <m.path
          key={s.nome}
          d={caminho(s.valores, y)}
          fill="none"
          stroke={corDa(s)}
          strokeWidth={2}
          strokeLinejoin="round"
          initial={menos ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.9, ease: [0.2, 0.7, 0.2, 1], delay: k * 0.12 }}
        />
      ))}
    </>
  );
}

function EixoX({ rotulos, altura }: { readonly rotulos: readonly string[]; readonly altura: number }) {
  const passo = Math.ceil(rotulos.length / 6);
  return (
    <g className="imob-grafico__eixo" aria-hidden="true">
      {rotulos.map((r, i) =>
        i % passo === 0 ? (
          <text key={r} x={xDoPonto(i, rotulos.length)} y={altura - 8} textAnchor="middle">
            {r}
          </text>
        ) : null,
      )}
    </g>
  );
}

function Mira({
  p,
  ativo,
  y,
  altura,
}: {
  readonly p: Props;
  readonly ativo: number;
  readonly y: (v: number) => number;
  readonly altura: number;
}) {
  const x = xDoPonto(ativo, p.rotulos.length);
  return (
    <g aria-hidden="true">
      <line className="imob-grafico__mira" x1={x} x2={x} y1={MARGEM.topo} y2={altura - MARGEM.base} />
      {p.series.map((s) => (
        <circle
          key={s.nome}
          cx={x}
          cy={y(s.valores[ativo] ?? 0)}
          r={4.5}
          fill={corDa(s)}
          className="imob-grafico__ponto"
        />
      ))}
    </g>
  );
}

export function GraficoLinhas(p: Props) {
  const id = useId();
  const [ativo, setAtivo] = useState<number | null>(null);
  const altura = p.altura ?? 260;
  const todos = p.series.flatMap((s) => s.valores);
  const { y, marcas } = escala(Math.min(...todos), Math.max(...todos), altura);
  const apontar = (e: PointerEvent<SVGElement>) => setAtivo(indicePeloPonteiro(e, p.rotulos.length));
  return (
    <figure className="imob-grafico">
      <figcaption id={`${id}-desc`} className="imob-grafico__titulo">
        {p.titulo}
        <span className="so-leitor">: {p.descricao}</span>
      </figcaption>
      <Legenda series={p.series} />
      <div className="imob-grafico__area">
        <svg viewBox={`0 0 ${LARGURA} ${altura}`} role="img" aria-labelledby={`${id}-desc`}>
          <EixoY marcas={marcas} y={y} formatar={p.formatarEixo} />
          <EixoX rotulos={p.rotulos} altura={altura} />
          <Tracos series={p.series} y={y} />
          {ativo !== null ? <Mira p={p} ativo={ativo} y={y} altura={altura} /> : null}
          <Sensor altura={altura} apontar={apontar} sair={() => setAtivo(null)} />
        </svg>
        {ativo !== null ? (
          <Dica
            x={xDoPonto(ativo, p.rotulos.length)}
            titulo={p.rotulos[ativo] ?? ""}
            linhas={p.series.map((s) => ({
              nome: s.nome,
              cor: corDa(s),
              texto: p.formatar(s.valores[ativo] ?? 0),
            }))}
          />
        ) : null}
      </div>
      <TabelaDados
        titulo={p.titulo}
        cabecalho={["", ...p.series.map((s) => s.nome)]}
        linhas={p.rotulos.map((r, i) => [r, ...p.series.map((s) => p.formatar(s.valores[i] ?? 0))])}
      />
    </figure>
  );
}
