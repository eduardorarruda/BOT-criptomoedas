import { m } from "motion/react";
import { useId } from "react";
import { useMenosMovimento } from "../ganchos/movimento";

/**
 * Minigráfico (sparkline) em SVG: só a forma da série, sem eixos. Serve de apoio
 * a um número (cartão de KPI, linha de tabela) — o número continua sendo a
 * informação; o desenho é decorativo e fica escondido do leitor de tela, a não
 * ser que receba `rotulo`.
 *
 * `tom="auto"` pinta de ganho se a série terminou acima do começo, de perda se
 * abaixo, e neutro se igual.
 */
export type TomMinigrafico = "marca" | "ganho" | "perda" | "atencao" | "neutro" | "auto";

interface Props {
  readonly valores: readonly number[];
  readonly tom?: TomMinigrafico;
  readonly largura?: number;
  readonly altura?: number;
  readonly rotulo?: string;
  readonly className?: string;
}

const MARGEM = 2;

/** Pontos da polilinha normalizados para a caixa. Série constante vira uma reta no meio. */
export function caminhoMinigrafico(valores: readonly number[], largura: number, altura: number): string {
  if (valores.length === 0) return "";
  const min = Math.min(...valores);
  const max = Math.max(...valores);
  const faixa = max - min;
  const passo = valores.length > 1 ? (largura - MARGEM * 2) / (valores.length - 1) : 0;
  return valores
    .map((v, i) => {
      const x = MARGEM + i * passo;
      const y = faixa === 0 ? altura / 2 : MARGEM + (1 - (v - min) / faixa) * (altura - MARGEM * 2);
      return `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

export function tomDaSerie(valores: readonly number[]): "ganho" | "perda" | "neutro" {
  const primeiro = valores[0];
  const ultimo = valores.at(-1);
  if (primeiro === undefined || ultimo === undefined || primeiro === ultimo) return "neutro";
  return ultimo > primeiro ? "ganho" : "perda";
}

export function Minigrafico({ valores, tom = "auto", largura = 120, altura = 36, rotulo, className }: Props) {
  const id = useId();
  const menos = useMenosMovimento();
  if (valores.length < 2) return null;
  const cor = tom === "auto" ? tomDaSerie(valores) : tom;
  const linha = caminhoMinigrafico(valores, largura, altura);
  const area = `${linha} L${(largura - MARGEM).toFixed(2)} ${altura} L${MARGEM} ${altura} Z`;
  const acessivel = rotulo ? { role: "img", "aria-label": rotulo } : { "aria-hidden": true };
  return (
    <svg
      viewBox={`0 0 ${largura} ${altura}`}
      width={largura}
      height={altura}
      preserveAspectRatio="none"
      className={`minigrafico minigrafico--${cor} ${className ?? ""}`.trim()}
      {...acessivel}
    >
      <defs>
        <linearGradient id={`${id}-area`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.22" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id}-area)`} stroke="none" />
      <m.path
        d={linha}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        initial={menos ? false : { pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
      />
    </svg>
  );
}
