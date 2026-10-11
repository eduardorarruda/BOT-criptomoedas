import { m } from "motion/react";
import { useId, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { useMenosMovimento } from "../../ganchos/movimento";

/**
 * Gráficos da renda fixa em SVG puro (sem biblioteca): a rosca da alocação e as
 * linhas da projeção e dos simuladores. Desenham com movimento curto, que some com
 * prefers-reduced-motion. Cada gráfico tem um rótulo e os números ficam ao lado,
 * em texto, para quem não enxerga o desenho.
 */
export const CORES = [
  "var(--cat-1)",
  "var(--cat-2)",
  "var(--cat-3)",
  "var(--cat-4)",
  "var(--cat-5)",
  "var(--cat-6)",
  "var(--cat-7)",
  "var(--cat-8)",
];
export const corDe = (i: number): string => CORES[i % CORES.length] ?? "var(--cat-1)";

export interface Fatia {
  readonly rotulo: string;
  /** Fração (0 a 1). */
  readonly fracao: number;
}

const RAIO = 42;
const CIRCUNFERENCIA = 2 * Math.PI * RAIO;
const FOLGA = 1.2;

export function Rosca({ fatias, rotulo }: { readonly fatias: readonly Fatia[]; readonly rotulo: string }) {
  const menos = useMenosMovimento();
  const inicios = fatias.map((_, i) => fatias.slice(0, i).reduce((s, f) => s + f.fracao * CIRCUNFERENCIA, 0));
  const segmentos = fatias.map((f, i) => ({
    inicio: inicios[i] ?? 0,
    comprimento: f.fracao * CIRCUNFERENCIA,
    cor: corDe(i),
    rotulo: f.rotulo,
  }));
  return (
    <svg viewBox="0 0 100 100" className="rf-rosca" role="img" aria-label={rotulo}>
      <circle cx="50" cy="50" r={RAIO} className="rf-rosca__trilho" />
      {segmentos.map((s, i) => {
        const visivel = Math.max(s.comprimento - FOLGA, 0.01);
        return (
          <m.circle
            key={s.rotulo}
            cx="50"
            cy="50"
            r={RAIO}
            fill="none"
            stroke={s.cor}
            strokeWidth="11"
            strokeDashoffset={-s.inicio}
            transform="rotate(-90 50 50)"
            initial={menos ? false : { strokeDasharray: `0 ${CIRCUNFERENCIA}` }}
            animate={{ strokeDasharray: `${visivel} ${CIRCUNFERENCIA - visivel}` }}
            transition={{ duration: menos ? 0 : 0.7, delay: menos ? 0 : i * 0.08, ease: [0.16, 1, 0.3, 1] }}
          />
        );
      })}
    </svg>
  );
}

export interface Serie {
  readonly nome: string;
  readonly valores: readonly number[];
  readonly cor: string;
  readonly tracejada?: boolean;
}

interface PropsLinhas {
  readonly rotulo: string;
  readonly rotulosX: readonly string[];
  readonly series: readonly Serie[];
  readonly formatarY: (v: number) => string;
  /** Linha vertical de referência (ex.: a inflação de equilíbrio), no índice do eixo X. */
  readonly marcaX?: { readonly indice: number; readonly texto: string };
}

const A = 240;
const M = { esq: 74, dir: 12, topo: 12, base: 28 };

/** Largura real do contêiner: o SVG desenha no tamanho da tela, sem esticar texto. */
function useLargura(ref: RefObject<HTMLDivElement | null>, padrao = 640): number {
  const [largura, setLargura] = useState(padrao);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const medir = () => setLargura(Math.max(280, Math.round(el.clientWidth || padrao)));
    medir();
    const obs = new ResizeObserver(medir);
    obs.observe(el);
    return () => obs.disconnect();
  }, [ref, padrao]);
  return largura;
}

function escalas(series: readonly Serie[], n: number, L: number) {
  const todos = series.flatMap((s) => s.valores);
  const min = Math.min(...todos);
  const max = Math.max(...todos);
  const folga = (max - min || Math.abs(max) || 1) * 0.08;
  const [y0, y1] = [min - folga, max + folga];
  const x = (i: number) => M.esq + (n <= 1 ? 0 : (i / (n - 1)) * (L - M.esq - M.dir));
  const y = (v: number) => M.topo + (1 - (v - y0) / (y1 - y0)) * (A - M.topo - M.base);
  return { x, y, y0, y1 };
}

/** Grade do eixo Y (4 marcas), rótulos do X (até 6; 3 em tela estreita) e a linha de referência. */
function Eixos({
  L,
  rotulosX,
  formatarY,
  escala: { x, y, y0, y1 },
  marcaX,
}: {
  readonly L: number;
  readonly rotulosX: readonly string[];
  readonly formatarY: (v: number) => string;
  readonly escala: ReturnType<typeof escalas>;
  readonly marcaX?: PropsLinhas["marcaX"];
}) {
  const marcasY = Array.from({ length: 4 }, (_, i) => y0 + ((y1 - y0) * (i + 0.5)) / 4);
  const passoX = Math.max(1, Math.ceil(rotulosX.length / (L < 480 ? 3 : 6)));
  return (
    <>
      {marcasY.map((v) => (
        <g key={v} className="rf-linhas__grade">
          <line x1={M.esq} x2={L - M.dir} y1={y(v)} y2={y(v)} />
          <text x={M.esq - 8} y={y(v)} dy="0.32em" textAnchor="end">
            {formatarY(v)}
          </text>
        </g>
      ))}
      {rotulosX.map((r, i) =>
        i % passoX === 0 || i === rotulosX.length - 1 ? (
          <text key={`${r}-${i}`} x={x(i)} y={A - 8} textAnchor="middle" className="rf-linhas__eixo">
            {r}
          </text>
        ) : null,
      )}
      {marcaX ? (
        <g className="rf-linhas__marca">
          <line x1={x(marcaX.indice)} x2={x(marcaX.indice)} y1={M.topo} y2={A - M.base} />
          <text x={x(marcaX.indice) + 6} y={M.topo + 10}>
            {marcaX.texto}
          </text>
        </g>
      ) : null}
    </>
  );
}

/** Linhas sobre o mesmo eixo X (datas ou cenários). Mostra 4 marcas no eixo Y e até 6 rótulos no X. */
export function Linhas({ rotulo, rotulosX, series, formatarY, marcaX }: PropsLinhas) {
  const menos = useMenosMovimento();
  const idClip = `rf-clip-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const caixa = useRef<HTMLDivElement>(null);
  const L = useLargura(caixa);
  if (rotulosX.length === 0 || series.every((s) => s.valores.length === 0)) return null;
  const escala = escalas(series, rotulosX.length, L);
  const { x, y } = escala;
  return (
    <div ref={caixa} className="rf-linhas__caixa">
      <svg viewBox={`0 0 ${L} ${A}`} className="rf-linhas" role="img" aria-label={rotulo}>
        <clipPath id={idClip}>
          <rect x={M.esq} y={0} width={L - M.esq} height={A} />
        </clipPath>
        <Eixos
          L={L}
          rotulosX={rotulosX}
          formatarY={formatarY}
          escala={escala}
          {...(marcaX ? { marcaX } : {})}
        />
        <g clipPath={`url(#${idClip})`}>
          {series.map((s, i) => (
            <m.path
              key={s.nome}
              d={s.valores
                .map((v, j) => `${j === 0 ? "M" : "L"}${x(j).toFixed(1)},${y(v).toFixed(1)}`)
                .join(" ")}
              fill="none"
              stroke={s.cor}
              strokeWidth={2.2}
              strokeDasharray={s.tracejada ? "6 5" : undefined}
              vectorEffect="non-scaling-stroke"
              initial={menos ? false : s.tracejada ? { opacity: 0 } : { pathLength: 0 }}
              animate={s.tracejada ? { opacity: 1 } : { pathLength: 1 }}
              transition={{ duration: menos ? 0 : 0.9, delay: menos ? 0 : i * 0.12, ease: [0.16, 1, 0.3, 1] }}
            />
          ))}
        </g>
      </svg>
    </div>
  );
}

export function Legenda({
  itens,
}: {
  readonly itens: readonly { readonly nome: string; readonly cor: string; readonly valor?: string }[];
}) {
  return (
    <ul className="rf-legenda" role="list">
      {itens.map((i) => (
        <li key={i.nome}>
          <span className="rf-legenda__cor" style={{ background: i.cor }} aria-hidden="true" />
          <span>{i.nome}</span>
          {i.valor ? <span className="num rf-legenda__valor">{i.valor}</span> : null}
        </li>
      ))}
    </ul>
  );
}
